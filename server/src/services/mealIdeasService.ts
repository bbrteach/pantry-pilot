import { db } from '../db/database.js';
import type { MealIdeaIngredient } from '../data/mealIdeas.js';
import { normalizeIngredientName } from './consolidation.js';
import {
  cleanRecipeUrl,
  extractJsonLdRecipe,
  extractRssItems,
  isSafePublicHttpUrl,
  parseTheMealDbMeal,
  type ParsedWebRecipe,
} from './recipeParser.js';

export interface MealIdeaItem {
  id: string;
  name: string;
  notes: string;
  prepTime: string;
  tags: string[];
  imageUrl: string;
  sourceName: string;
  sourceUrl: string;
  isLive: boolean;
  publishedAt: string;
  ingredients: MealIdeaIngredient[];
  inLibrary: boolean;
}

export interface MealIdeasFeedResponse {
  ideas: MealIdeaItem[];
  lastRefreshedAt: string | null;
  stale: boolean;
  liveCount: number;
  sources: string[];
}

interface FeedSourceConfig {
  name: string;
  feedUrl: string;
  maxItems: number;
  defaultTags?: string[];
}

export const RECIPE_FEED_SOURCES: FeedSourceConfig[] = [
  {
    name: 'Budget Bytes',
    feedUrl: 'https://www.budgetbytes.com/category/recipes/main-dish/feed/',
    maxItems: 5,
    defaultTags: ['Budget'],
  },
  {
    name: 'Skinnytaste',
    feedUrl: 'https://www.skinnytaste.com/recipes/dinner-recipes/feed/',
    maxItems: 5,
    defaultTags: ['Healthy'],
  },
  {
    name: 'Pinch of Yum',
    feedUrl: 'https://pinchofyum.com/recipes/dinner/feed',
    maxItems: 5,
  },
  {
    name: 'RecipeTin Eats',
    feedUrl: 'https://www.recipetineats.com/category/main-dishes/feed/',
    maxItems: 5,
  },
  {
    name: "Natasha's Kitchen",
    feedUrl: 'https://natashaskitchen.com/category/main-course/feed/',
    maxItems: 5,
  },
];

const LAST_REFRESHED_SETTING_KEY = 'meal_ideas_last_refreshed_at';
const AUTO_REFRESH_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const FETCH_HEADERS = {
  'User-Agent': 'PantryPilot/1.0 (+https://pantrypilot.app)',
  Accept: 'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
};

let inflightRefresh: Promise<MealIdeasFeedResponse> | null = null;

interface CachedIdeaRow {
  id: string;
  name: string;
  notes: string;
  prep_time: string;
  tags: string;
  image_url: string;
  source_name: string;
  source_url: string;
  ingredients: string;
  published_at: string;
  fetched_at: string;
}

function getLastRefreshedAt(): string | null {
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(LAST_REFRESHED_SETTING_KEY) as { value: string } | undefined;
  return row?.value || null;
}

function setLastRefreshedAt(isoTimestamp: string): void {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(LAST_REFRESHED_SETTING_KEY, isoTimestamp);
}

function getExistingLibraryNames(): Set<string> {
  const rows = db.prepare('SELECT name FROM meals').all() as Array<{ name: string }>;
  return new Set(rows.map((r) => normalizeIngredientName(r.name)));
}

function parseCachedRow(row: CachedIdeaRow, existingNames: Set<string>): MealIdeaItem {
  let tags: string[] = [];
  let ingredients: MealIdeaIngredient[] = [];
  try {
    tags = JSON.parse(row.tags || '[]') as string[];
  } catch {
    tags = [];
  }
  try {
    ingredients = JSON.parse(row.ingredients || '[]') as MealIdeaIngredient[];
  } catch {
    ingredients = [];
  }

  return {
    id: row.id,
    name: row.name,
    notes: row.notes || '',
    prepTime: row.prep_time || '',
    tags,
    imageUrl: row.image_url || '',
    sourceName: row.source_name || 'Web Recipe',
    sourceUrl: row.source_url || '',
    isLive: true,
    publishedAt: row.published_at || '',
    ingredients,
    inLibrary: existingNames.has(normalizeIngredientName(row.name)),
  };
}

function upsertCachedRecipes(recipes: ParsedWebRecipe[], replaceAll = false): void {
  if (!replaceAll && recipes.length === 0) return;

  const tx = db.transaction(() => {
    if (replaceAll) {
      db.prepare('DELETE FROM meal_ideas_cache').run();
    }
    const stmt = db.prepare(
      `INSERT INTO meal_ideas_cache
        (id, name, notes, prep_time, tags, image_url, source_name, source_url, ingredients, published_at, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         notes = excluded.notes,
         prep_time = excluded.prep_time,
         tags = excluded.tags,
         image_url = excluded.image_url,
         source_name = excluded.source_name,
         source_url = excluded.source_url,
         ingredients = excluded.ingredients,
         published_at = excluded.published_at,
         fetched_at = datetime('now')`
    );

    for (const recipe of recipes) {
      stmt.run(
        recipe.id,
        recipe.name,
        recipe.notes,
        recipe.prepTime,
        JSON.stringify(recipe.tags),
        recipe.imageUrl,
        recipe.sourceName,
        recipe.sourceUrl,
        JSON.stringify(recipe.ingredients),
        recipe.publishedAt
      );
    }
  });

  tx();
}

export function getMealIdeasFeed(): MealIdeasFeedResponse {
  const existingNames = getExistingLibraryNames();
  const cachedRows = db
    .prepare(
      `SELECT id, name, notes, prep_time, tags, image_url, source_name, source_url, ingredients, published_at, fetched_at
       FROM meal_ideas_cache
       ORDER BY fetched_at DESC, rowid ASC`
    )
    .all() as CachedIdeaRow[];

  const liveIdeas = cachedRows.map((row) => parseCachedRow(row, existingNames));

  const lastRefreshedAt = getLastRefreshedAt();
  const lastTs = lastRefreshedAt ? Date.parse(lastRefreshedAt) : NaN;
  const stale =
    liveIdeas.length === 0 ||
    !Number.isFinite(lastTs) ||
    Date.now() - lastTs > AUTO_REFRESH_TTL_MS;

  const sourceSet = new Set<string>();
  for (const item of liveIdeas) {
    if (item.sourceName) sourceSet.add(item.sourceName);
  }

  return {
    ideas: liveIdeas,
    lastRefreshedAt,
    stale,
    liveCount: liveIdeas.length,
    sources: Array.from(sourceSet),
  };
}

export function findMealIdeaById(ideaId: string): MealIdeaItem | null {
  const existingNames = getExistingLibraryNames();

  const cached = db
    .prepare(
      `SELECT id, name, notes, prep_time, tags, image_url, source_name, source_url, ingredients, published_at, fetched_at
       FROM meal_ideas_cache
       WHERE id = ?`
    )
    .get(ideaId) as CachedIdeaRow | undefined;

  if (!cached) return null;
  return parseCachedRow(cached, existingNames);
}

async function fetchSingleFeedSource(source: FeedSourceConfig): Promise<ParsedWebRecipe[]> {
  try {
    const feedRes = await fetch(source.feedUrl, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(6500),
    });
    if (!feedRes.ok) return [];
    const xml = await feedRes.text();
    const items = extractRssItems(xml, source.maxItems + 2);
    if (items.length === 0) return [];

    const parsedList = await Promise.all(
      items.map(async (item): Promise<ParsedWebRecipe | null> => {
        try {
          const pageRes = await fetch(item.link, {
            headers: FETCH_HEADERS,
            signal: AbortSignal.timeout(6500),
          });
          if (!pageRes.ok) return null;
          const html = await pageRes.text();
          return extractJsonLdRecipe(html, {
            sourceUrl: item.link,
            sourceName: source.name,
            publishedAt: item.pubDate,
            defaultTags: source.defaultTags,
          });
        } catch {
          return null;
        }
      })
    );

    const valid: ParsedWebRecipe[] = [];
    for (const r of parsedList) {
      if (r) valid.push(r);
      if (valid.length >= source.maxItems) break;
    }
    return valid;
  } catch {
    return [];
  }
}

async function fetchRotatingTheMealDbRecipes(count = 6): Promise<ParsedWebRecipe[]> {
  const excludedCategories = new Set(['dessert', 'breakfast']);
  const results: ParsedWebRecipe[] = [];
  const seenIds = new Set<string>();

  // Issue a small batch of random calls in parallel so every refresh brings new variety
  const attempts = Array.from({ length: count + 4 }, async () => {
    try {
      const res = await fetch('https://www.themealdb.com/api/json/v1/1/random.php', {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { meals?: Array<Record<string, unknown>> | null };
      const meal = data.meals?.[0];
      if (!meal) return null;
      const cat = typeof meal.strCategory === 'string' ? meal.strCategory.toLowerCase() : '';
      if (excludedCategories.has(cat)) return null;
      return parseTheMealDbMeal(meal);
    } catch {
      return null;
    }
  });

  const fetched = await Promise.all(attempts);
  for (const recipe of fetched) {
    if (!recipe || seenIds.has(recipe.id)) continue;
    seenIds.add(recipe.id);
    results.push(recipe);
    if (results.length >= count) break;
  }

  return results;
}

export async function refreshLiveMealIdeas(): Promise<MealIdeasFeedResponse> {
  if (inflightRefresh) {
    return inflightRefresh;
  }

  inflightRefresh = (async () => {
    try {
      const [feedGroups, mealDbRecipes] = await Promise.all([
        Promise.all(RECIPE_FEED_SOURCES.map((src) => fetchSingleFeedSource(src))),
        fetchRotatingTheMealDbRecipes(8),
      ]);

      // Interleave recipes across sources so the top of the Meal Ideas grid has rich variety
      const buckets: ParsedWebRecipe[][] = [...feedGroups, mealDbRecipes].filter(
        (b) => b.length > 0
      );
      const interleaved: ParsedWebRecipe[] = [];
      const seenNames = new Set<string>();
      const seenIds = new Set<string>();

      const maxLen = Math.max(0, ...buckets.map((b) => b.length));
      for (let i = 0; i < maxLen; i++) {
        for (const bucket of buckets) {
          const item = bucket[i];
          if (!item) continue;
          const norm = normalizeIngredientName(item.name);
          if (seenNames.has(norm) || seenIds.has(item.id)) continue;
          seenNames.add(norm);
          seenIds.add(item.id);
          interleaved.push(item);
        }
      }

      if (interleaved.length > 0) {
        upsertCachedRecipes(interleaved, true);
        setLastRefreshedAt(new Date().toISOString());
      }

      return getMealIdeasFeed();
    } finally {
      inflightRefresh = null;
    }
  })();

  return inflightRefresh;
}

export async function searchLiveMealIdeas(query: string): Promise<MealIdeaItem[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const existingNames = getExistingLibraryNames();
  const res = await fetch(
    `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(trimmed)}`,
    {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(7000),
    }
  );

  if (!res.ok) {
    throw new Error(`Recipe search failed (${res.status})`);
  }

  const data = (await res.json()) as { meals?: Array<Record<string, unknown>> | null };
  const rawMeals = Array.isArray(data.meals) ? data.meals : [];

  const parsed: ParsedWebRecipe[] = [];
  for (const raw of rawMeals.slice(0, 12)) {
    const recipe = parseTheMealDbMeal(raw);
    if (recipe) parsed.push(recipe);
  }

  if (parsed.length > 0) {
    upsertCachedRecipes(parsed, false);
  }

  return parsed.map((recipe) => ({
    ...recipe,
    isLive: true,
    inLibrary: existingNames.has(normalizeIngredientName(recipe.name)),
  }));
}

export async function importMealIdeaFromUrl(rawUrl: string): Promise<MealIdeaItem> {
  const cleanedUrl = cleanRecipeUrl(rawUrl);
  if (!cleanedUrl || !isSafePublicHttpUrl(cleanedUrl)) {
    throw new Error('Please enter a valid public recipe website URL (https://...).');
  }

  const res = await fetch(cleanedUrl, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`Could not load that recipe page (HTTP ${res.status}).`);
  }

  const html = await res.text();
  const hostname = new URL(cleanedUrl).hostname.replace(/^www\./i, '');
  const sourceName = hostname
    .split('.')[0]
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

  const parsed = extractJsonLdRecipe(html, {
    sourceUrl: cleanedUrl,
    sourceName: sourceName || hostname,
  });

  if (!parsed) {
    throw new Error(
      'No structured recipe data was found on that page. Try a direct recipe post URL.'
    );
  }

  upsertCachedRecipes([parsed], false);
  const existingNames = getExistingLibraryNames();

  return {
    ...parsed,
    isLive: true,
    inLibrary: existingNames.has(normalizeIngredientName(parsed.name)),
  };
}
