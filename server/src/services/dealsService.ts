import { db } from '../db/database.js';
import { MEAL_IDEA_CATALOG } from '../data/mealIdeas.js';
import { normalizeIngredientName } from './consolidation.js';
import {
  getSavedStore,
  isKrogerConfigured,
  searchProducts,
  type KrogerProductResult,
} from './krogerService.js';

export interface KrogerDealItem {
  id?: number;
  locationId: string;
  searchTerm: string;
  upc: string;
  productId: string;
  description: string;
  brand: string;
  size: string;
  imageUrl: string;
  regularPrice: number;
  promoPrice: number;
  savingsAmount: number;
  savingsPercent: number;
  stockLevel: string;
  scannedAt: string;
}

export interface MatchedSaleIngredient {
  ingredientName: string;
  dealUpc: string;
  dealDescription: string;
  regularPrice: number;
  promoPrice: number;
  savingsAmount: number;
  savingsPercent: number;
}

export interface SavedMealDealSuggestion {
  mealId: number;
  mealName: string;
  imageUrl: string;
  tags: string[];
  notes: string;
  inCurrentPlan: boolean;
  matchedIngredients: MatchedSaleIngredient[];
  estimatedSavings: number;
}

export interface NewMealIdeaTemplate {
  id: string;
  name: string;
  notes: string;
  tags: string[];
  ingredients: Array<{ name: string; quantity: number; unit: string; alternatives?: string[] }>;
}

export interface NewMealDealSuggestion extends NewMealIdeaTemplate {
  matchedIngredients: MatchedSaleIngredient[];
  estimatedSavings: number;
}

const DEFAULT_SALE_SCAN_TERMS = [
  'chicken breast',
  'ground beef',
  'pork shoulder',
  'salmon fillets',
  'shredded cheddar cheese',
  'pasta',
  'marinara sauce',
  'flour tortillas',
  'black beans',
  'broccoli',
  'bell peppers',
  'jasmine rice',
  'milk',
  'eggs',
  'bacon',
  'italian sausage',
];

const IGNORED_TINY_INGREDIENTS = new Set([
  'salt',
  'black pepper',
  'pepper',
  'water',
  'olive oil',
  'vegetable oil',
  'cooking spray',
  'sugar',
]);

const CURATED_MEAL_IDEAS: NewMealIdeaTemplate[] = MEAL_IDEA_CATALOG;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function getTokens(text: string): string[] {
  return normalizeIngredientName(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !['the', 'and', 'with', 'for', 'grade', 'fresh', 'kroger', 'simple', 'truth'].includes(w));
}

function findBestDealForIngredient(
  ingredientName: string,
  deals: KrogerDealItem[],
  mappedUpcByNormName: Map<string, string>
): KrogerDealItem | null {
  const norm = normalizeIngredientName(ingredientName);
  if (IGNORED_TINY_INGREDIENTS.has(norm)) return null;

  // 1. Exact mapped UPC match takes highest priority
  const mappedUpc = mappedUpcByNormName.get(norm);
  if (mappedUpc) {
    const exact = deals.find((d) => d.upc === mappedUpc);
    if (exact) return exact;
  }

  // 2. Direct search_term or substring match
  const directMatches = deals.filter((d) => {
    const dTerm = normalizeIngredientName(d.searchTerm);
    const dDesc = normalizeIngredientName(d.description);
    return (
      dTerm === norm ||
      dTerm.includes(norm) ||
      norm.includes(dTerm) ||
      dDesc.includes(norm)
    );
  });

  if (directMatches.length > 0) {
    return directMatches.sort((a, b) => b.savingsPercent - a.savingsPercent)[0];
  }

  // 3. Multi-token overlap match (e.g., "shredded cheddar cheese" <-> "Cheddar Cheese")
  const ingTokens = getTokens(norm);
  if (ingTokens.length === 0) return null;

  let bestDeal: KrogerDealItem | null = null;
  let bestScore = 0;

  for (const deal of deals) {
    const dealText = `${deal.searchTerm} ${deal.description}`;
    const dealTokens = new Set(getTokens(dealText));
    let overlap = 0;
    for (const token of ingTokens) {
      if (dealTokens.has(token)) overlap++;
    }
    const minRequired = ingTokens.length === 1 ? 1 : Math.min(2, ingTokens.length);
    if (overlap >= minRequired) {
      const score = overlap * 100 + deal.savingsPercent;
      if (score > bestScore) {
        bestScore = score;
        bestDeal = deal;
      }
    }
  }

  return bestDeal;
}

function loadCachedDeals(locationId: string): { deals: KrogerDealItem[]; scannedAt: string | null } {
  const rows = db
    .prepare(
      `SELECT id, location_id, search_term, upc, product_id, description, brand, size,
              image_url, regular_price, promo_price, savings_amount, savings_percent,
              stock_level, scanned_at
       FROM kroger_deals_cache
       WHERE location_id = ?
       ORDER BY savings_percent DESC, savings_amount DESC`
    )
    .all(locationId) as Array<{
    id: number;
    location_id: string;
    search_term: string;
    upc: string;
    product_id: string;
    description: string;
    brand: string;
    size: string;
    image_url: string;
    regular_price: number;
    promo_price: number;
    savings_amount: number;
    savings_percent: number;
    stock_level: string;
    scanned_at: string;
  }>;

  if (rows.length === 0) {
    return { deals: [], scannedAt: null };
  }

  return {
    scannedAt: rows[0].scanned_at,
    deals: rows.map((r) => ({
      id: r.id,
      locationId: r.location_id,
      searchTerm: r.search_term,
      upc: r.upc,
      productId: r.product_id,
      description: r.description,
      brand: r.brand,
      size: r.size,
      imageUrl: r.image_url,
      regularPrice: r.regular_price,
      promoPrice: r.promo_price,
      savingsAmount: r.savings_amount,
      savingsPercent: r.savings_percent,
      stockLevel: r.stock_level,
      scannedAt: r.scanned_at,
    })),
  };
}

export function buildDealSuggestions(deals: KrogerDealItem[]): {
  savedMealSuggestions: SavedMealDealSuggestion[];
  newMealIdeas: NewMealDealSuggestion[];
} {
  if (deals.length === 0) {
    return { savedMealSuggestions: [], newMealIdeas: [] };
  }

  const mappings = db
    .prepare('SELECT normalized_name, upc FROM product_mappings')
    .all() as Array<{ normalized_name: string; upc: string }>;
  const mappedUpcByNormName = new Map(mappings.map((m) => [m.normalized_name, m.upc]));

  const selectedRows = db
    .prepare('SELECT meal_id FROM meal_plan_selections')
    .all() as Array<{ meal_id: number }>;
  const selectedSet = new Set(selectedRows.map((r) => r.meal_id));

  const mealRows = db
    .prepare('SELECT id, name, notes, tags, image_url FROM meals ORDER BY name COLLATE NOCASE ASC')
    .all() as Array<{
    id: number;
    name: string;
    notes: string;
    tags: string;
    image_url: string;
  }>;

  const ingRows = db
    .prepare('SELECT meal_id, name FROM meal_ingredients ORDER BY id ASC')
    .all() as Array<{ meal_id: number; name: string }>;

  const ingsByMeal = new Map<number, string[]>();
  for (const ing of ingRows) {
    const list = ingsByMeal.get(ing.meal_id) ?? [];
    list.push(ing.name);
    ingsByMeal.set(ing.meal_id, list);
  }

  const existingMealNames = new Set(mealRows.map((m) => normalizeIngredientName(m.name)));
  const savedMealSuggestions: SavedMealDealSuggestion[] = [];

  for (const meal of mealRows) {
    const mealIngs = ingsByMeal.get(meal.id) ?? [];
    const matched: MatchedSaleIngredient[] = [];
    const seenUpcs = new Set<string>();

    for (const ingName of mealIngs) {
      const deal = findBestDealForIngredient(ingName, deals, mappedUpcByNormName);
      if (deal && !seenUpcs.has(deal.upc)) {
        seenUpcs.add(deal.upc);
        matched.push({
          ingredientName: ingName,
          dealUpc: deal.upc,
          dealDescription: deal.description,
          regularPrice: deal.regularPrice,
          promoPrice: deal.promoPrice,
          savingsAmount: deal.savingsAmount,
          savingsPercent: deal.savingsPercent,
        });
      }
    }

    if (matched.length > 0) {
      const estimatedSavings = roundMoney(
        matched.reduce((sum, item) => sum + item.savingsAmount, 0)
      );
      savedMealSuggestions.push({
        mealId: meal.id,
        mealName: meal.name,
        imageUrl: meal.image_url || '',
        tags: JSON.parse(meal.tags || '[]') as string[],
        notes: meal.notes,
        inCurrentPlan: selectedSet.has(meal.id),
        matchedIngredients: matched,
        estimatedSavings,
      });
    }
  }

  savedMealSuggestions.sort(
    (a, b) =>
      b.matchedIngredients.length - a.matchedIngredients.length ||
      b.estimatedSavings - a.estimatedSavings
  );

  const newMealIdeas: NewMealDealSuggestion[] = [];
  for (const template of CURATED_MEAL_IDEAS) {
    if (existingMealNames.has(normalizeIngredientName(template.name))) continue;

    const matched: MatchedSaleIngredient[] = [];
    const seenUpcs = new Set<string>();

    for (const ing of template.ingredients) {
      const deal = findBestDealForIngredient(ing.name, deals, mappedUpcByNormName);
      if (deal && !seenUpcs.has(deal.upc)) {
        seenUpcs.add(deal.upc);
        matched.push({
          ingredientName: ing.name,
          dealUpc: deal.upc,
          dealDescription: deal.description,
          regularPrice: deal.regularPrice,
          promoPrice: deal.promoPrice,
          savingsAmount: deal.savingsAmount,
          savingsPercent: deal.savingsPercent,
        });
      }
    }

    if (matched.length > 0) {
      newMealIdeas.push({
        ...template,
        matchedIngredients: matched,
        estimatedSavings: roundMoney(
          matched.reduce((sum, item) => sum + item.savingsAmount, 0)
        ),
      });
    }
  }

  newMealIdeas.sort(
    (a, b) =>
      b.matchedIngredients.length - a.matchedIngredients.length ||
      b.estimatedSavings - a.estimatedSavings
  );

  return {
    savedMealSuggestions,
    newMealIdeas: newMealIdeas.slice(0, 6),
  };
}

function collectScanTerms(): string[] {
  const terms = new Set<string>();

  // Prioritize ingredients from saved meals and auto-included staples
  const mealIngredients = db
    .prepare(
      `SELECT normalized_name, COUNT(*) as freq
       FROM meal_ingredients
       GROUP BY normalized_name
       ORDER BY freq DESC
       LIMIT 14`
    )
    .all() as Array<{ normalized_name: string; freq: number }>;

  for (const row of mealIngredients) {
    if (!IGNORED_TINY_INGREDIENTS.has(row.normalized_name) && row.normalized_name.length >= 3) {
      terms.add(row.normalized_name);
    }
  }

  for (const fallback of DEFAULT_SALE_SCAN_TERMS) {
    if (terms.size >= 22) break;
    terms.add(fallback);
  }

  return Array.from(terms);
}

/**
 * Scans live Kroger promo prices at the saved store across saved-meal ingredients
 * and popular dinner staples, caching active sale items in SQLite.
 */
export async function scanKrogerDealsForStore(locationId: string) {
  const terms = collectScanTerms();
  const byUpc = new Map<string, KrogerDealItem>();
  const scannedAt = new Date().toISOString();

  // Process in small concurrent batches of 4 to stay fast and respectful of API limits
  const batchSize = 4;
  for (let i = 0; i < terms.length; i += batchSize) {
    const batch = terms.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (term) => {
        try {
          const products = await searchProducts(term, locationId, 8);
          return { term, products };
        } catch {
          return { term, products: [] as KrogerProductResult[] };
        }
      })
    );

    for (const { term, products } of batchResults) {
      for (const product of products) {
        if (
          product.regularPrice === null ||
          product.promoPrice === null ||
          product.promoPrice <= 0 ||
          product.promoPrice >= product.regularPrice ||
          product.stockLevel === 'TEMPORARILY_OUT_OF_STOCK'
        ) {
          continue;
        }

        const savingsAmount = roundMoney(product.regularPrice - product.promoPrice);
        const savingsPercent = Math.max(
          1,
          Math.round((savingsAmount / product.regularPrice) * 100)
        );

        const existing = byUpc.get(product.upc);
        if (!existing || savingsPercent > existing.savingsPercent) {
          byUpc.set(product.upc, {
            locationId,
            searchTerm: term,
            upc: product.upc,
            productId: product.productId,
            description: product.description,
            brand: product.brand,
            size: product.size,
            imageUrl: product.imageUrl,
            regularPrice: product.regularPrice,
            promoPrice: product.promoPrice,
            savingsAmount,
            savingsPercent,
            stockLevel: product.stockLevel,
            scannedAt,
          });
        }
      }
    }
  }

  const deals = Array.from(byUpc.values())
    .sort((a, b) => b.savingsPercent - a.savingsPercent || b.savingsAmount - a.savingsAmount)
    .slice(0, 40);

  const saveTx = db.transaction(() => {
    db.prepare('DELETE FROM kroger_deals_cache WHERE location_id = ?').run(locationId);
    const insert = db.prepare(
      `INSERT INTO kroger_deals_cache
        (location_id, search_term, upc, product_id, description, brand, size, image_url,
         regular_price, promo_price, savings_amount, savings_percent, stock_level, scanned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const d of deals) {
      insert.run(
        d.locationId,
        d.searchTerm,
        d.upc,
        d.productId,
        d.description,
        d.brand,
        d.size,
        d.imageUrl,
        d.regularPrice,
        d.promoPrice,
        d.savingsAmount,
        d.savingsPercent,
        d.stockLevel,
        d.scannedAt
      );
    }
  });

  saveTx();

  const suggestions = buildDealSuggestions(deals);
  return {
    configured: isKrogerConfigured(),
    store: getSavedStore(),
    scannedAt,
    deals,
    ...suggestions,
  };
}

export function getCachedKrogerDealsPayload() {
  const configured = isKrogerConfigured();
  const store = getSavedStore();
  if (!store) {
    return {
      configured,
      store: null,
      scannedAt: null,
      deals: [] as KrogerDealItem[],
      savedMealSuggestions: [] as SavedMealDealSuggestion[],
      newMealIdeas: [] as NewMealDealSuggestion[],
    };
  }

  const { deals, scannedAt } = loadCachedDeals(store.locationId);
  const suggestions = buildDealSuggestions(deals);
  return {
    configured,
    store,
    scannedAt,
    deals,
    ...suggestions,
  };
}
