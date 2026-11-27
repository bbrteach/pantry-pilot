import net from 'node:net';
import type { MealIdeaIngredient } from '../data/mealIdeas.js';
import { normalizeUnit, roundQuantity } from './consolidation.js';

export interface ParsedWebRecipe {
  id: string;
  name: string;
  notes: string;
  prepTime: string;
  tags: string[];
  imageUrl: string;
  sourceName: string;
  sourceUrl: string;
  ingredients: MealIdeaIngredient[];
  publishedAt: string;
}

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': ' 1/2',
  '⅓': ' 1/3',
  '⅔': ' 2/3',
  '¼': ' 1/4',
  '¾': ' 3/4',
  '⅕': ' 1/5',
  '⅖': ' 2/5',
  '⅗': ' 3/5',
  '⅘': ' 4/5',
  '⅙': ' 1/6',
  '⅚': ' 5/6',
  '⅛': ' 1/8',
  '⅜': ' 3/8',
  '⅝': ' 5/8',
  '⅞': ' 7/8',
};

const UNIT_ALIASES: Record<string, string> = {
  lb: 'lb',
  lbs: 'lbs',
  pound: 'lb',
  pounds: 'lbs',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  cup: 'cup',
  cups: 'cups',
  c: 'cup',
  tbsp: 'tbsp',
  tbs: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  clove: 'clove',
  cloves: 'cloves',
  can: 'can',
  cans: 'cans',
  jar: 'jar',
  jars: 'jars',
  bag: 'bag',
  bags: 'bags',
  box: 'box',
  boxes: 'boxes',
  pack: 'pack',
  packs: 'packs',
  package: 'pack',
  packages: 'packs',
  pkg: 'pack',
  bunch: 'bunch',
  bunches: 'bunches',
  head: 'head',
  heads: 'heads',
  stalk: 'stalk',
  stalks: 'stalks',
  slice: 'slice',
  slices: 'slices',
  sprig: 'sprig',
  sprigs: 'sprigs',
  pint: 'pint',
  pints: 'pints',
  quart: 'quart',
  quarts: 'quarts',
  gallon: 'gallon',
  gallons: 'gallons',
  bottle: 'bottle',
  bottles: 'bottles',
  loaf: 'loaf',
  loaves: 'loaves',
  stick: 'stick',
  sticks: 'sticks',
  pinch: 'pinch',
  pinches: 'pinches',
  dash: 'dash',
  dozen: 'dozen',
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  ml: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  piece: 'whole',
  pieces: 'whole',
  whole: 'whole',
  fillet: 'fillet',
  fillets: 'fillets',
  breast: 'breast',
  breasts: 'breasts',
  thigh: 'thigh',
  thighs: 'thighs',
  tub: 'tub',
  tubs: 'tubs',
  container: 'container',
  containers: 'containers',
  sheet: 'sheet',
  sheets: 'sheets',
};

const SIZE_ADJECTIVES = new Set([
  'small',
  'medium',
  'large',
  'extra-large',
  'xl',
  'jumbo',
  'mini',
  'fresh',
  'ripe',
  'whole',
]);

const TRACKING_PARAMS = new Set([
  'adt_ei',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
]);

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&frac12;/gi, '1/2')
    .replace(/&frac14;/gi, '1/4')
    .replace(/&frac34;/gi, '3/4')
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    });
}

export function cleanPlainText(input: string): string {
  return decodeHtmlEntities(input)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanRecipeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

export function isSafePublicHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return false;
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === '0.0.0.0' ||
      host === '::1'
    ) {
      return false;
    }

    const ipType = net.isIP(host);
    if (ipType === 4) {
      const octets = host.split('.').map(Number);
      if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n))) return false;
      const [a, b] = octets;
      if (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127)
      ) {
        return false;
      }
    } else if (ipType === 6) {
      if (
        host === '::' ||
        host === '::1' ||
        host.startsWith('fc') ||
        host.startsWith('fd') ||
        host.startsWith('fe80')
      ) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function slugifyId(prefix: string, text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return `${prefix}-${slug || 'recipe'}`;
}

export function formatIsoDuration(raw: unknown): { label: string; totalMinutes: number | null } {
  if (typeof raw !== 'string') return { label: '', totalMinutes: null };
  const trimmed = raw.trim().toUpperCase();
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(trimmed);
  if (!match) return { label: '', totalMinutes: null };

  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const mins = Number(match[3] ?? 0);
  const totalMinutes = days * 1440 + hours * 60 + mins;
  if (totalMinutes <= 0) return { label: '', totalMinutes: null };

  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return { label: `${h} hr ${m} min`, totalMinutes };
  if (h > 0) return { label: h === 1 ? '1 hr' : `${h} hrs`, totalMinutes };
  return { label: `${m} min`, totalMinutes };
}

function parseNumericToken(token: string): number | null {
  const cleaned = token.trim();
  if (!cleaned) return null;
  if (/^\d+(?:\.\d+)?$/.test(cleaned)) {
    const val = Number(cleaned);
    return Number.isFinite(val) && val > 0 ? val : null;
  }
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(cleaned);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    if (den > 0 && num > 0) return num / den;
  }
  return null;
}

function titleCaseIngredient(name: string): string {
  const smallWords = new Set(['of', 'and', 'or', 'in', 'with', 'for', 'to', 'a', 'the', 'on']);
  return name
    .split(/\s+/)
    .map((word, idx) => {
      if (!word) return '';
      const lower = word.toLowerCase();
      if (idx > 0 && smallWords.has(lower)) return lower;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Parses a human-written recipe ingredient line into PantryPilot's structured
 * `{ name, quantity, unit }` format.
 * Examples:
 *  - "2 lbs boneless skinless chicken breasts, diced" -> { name: "Boneless Skinless Chicken Breasts", quantity: 2, unit: "lbs" }
 *  - "1 (15 oz) can black beans, drained" -> { name: "Black Beans", quantity: 1, unit: "can" }
 *  - "1½ cups shredded cheddar cheese" -> { name: "Shredded Cheddar Cheese", quantity: 1.5, unit: "cups" }
 */
export function parseIngredientLine(raw: string): MealIdeaIngredient | null {
  let text = cleanPlainText(raw);
  if (!text) return null;

  // Replace unicode fractions with ASCII space-separated fractions
  for (const [sym, rep] of Object.entries(UNICODE_FRACTIONS)) {
    text = text.replaceAll(sym, rep);
  }

  // Normalize dashes and leading bullet symbols
  text = text
    .replace(/^[\s•·\-*–—]+/, '')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return null;

  // Drop trailing price annotations like "($1.45)" used by Budget Bytes
  text = text.replace(/\(\s*\$[\d.,]+\s*\)/g, '').replace(/\s+/g, ' ').trim();

  // Skip section headers like "For the sauce:"
  if (text.endsWith(':') && text.length < 50) return null;

  let quantity = 1;
  let rest = text;

  // Match leading quantity: mixed number ("1 1/2"), range ("2-3", "1 to 2"), fraction ("3/4"), or decimal ("1.5")
  const qtyRegex =
    /^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?)(?:\s*(?:-|to)\s*(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?))?\s*/i;
  const qtyMatch = qtyRegex.exec(rest);
  if (qtyMatch) {
    const parseMixed = (expr: string): number | null => {
      const parts = expr.trim().split(/\s+/);
      if (parts.length === 2) {
        const whole = parseNumericToken(parts[0]);
        const frac = parseNumericToken(parts[1]);
        if (whole !== null && frac !== null) return whole + frac;
      }
      return parseNumericToken(expr);
    };

    const first = parseMixed(qtyMatch[1]);
    const second = qtyMatch[2] ? parseMixed(qtyMatch[2]) : null;
    if (first !== null) {
      quantity = roundQuantity(second !== null && second > first ? second : first);
      rest = rest.slice(qtyMatch[0].length).trim();
    }
  }

  // Strip leading parenthetical package size like "(14.5 oz)" or "(15-ounce)"
  rest = rest.replace(/^\([^)]*\)\s*/, '').trim();

  // Extract unit if the next token is a known measurement unit
  let unit = '';
  const unitMatch = /^([a-zA-Z]+)\.?\s+(.*)$/.exec(rest);
  if (unitMatch) {
    const candidate = unitMatch[1].toLowerCase();
    const mapped = UNIT_ALIASES[candidate];
    if (mapped) {
      unit = normalizeUnit(mapped);
      rest = unitMatch[2].trim();
    } else if (SIZE_ADJECTIVES.has(candidate)) {
      // e.g. "2 large eggs" or "1 medium yellow onion" -> keep quantity, unit = 'whole' if no later unit
      const afterSize = unitMatch[2].trim();
      const nextWordMatch = /^([a-zA-Z]+)\.?\s+(.*)$/.exec(afterSize);
      if (nextWordMatch && UNIT_ALIASES[nextWordMatch[1].toLowerCase()]) {
        unit = normalizeUnit(UNIT_ALIASES[nextWordMatch[1].toLowerCase()]);
        rest = nextWordMatch[2].trim();
      } else {
        unit = 'whole';
        rest = afterSize;
      }
    }
  }

  // Remove leading "of " after unit (e.g., "2 cups of chicken broth")
  rest = rest.replace(/^of\s+/i, '').trim();

  // Clean trailing prep instructions after comma (e.g., ", finely chopped") or trailing parentheticals
  let name = rest
    .replace(/\([^)]*\)/g, '')
    .split(',')[0]
    .replace(/\b(optional|to taste|for serving|for garnish|plus more.*|as needed)\b.*$/i, '')
    .replace(/[*†]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!name || name.length < 2) return null;

  // Keep name concise and nicely formatted
  name = titleCaseIngredient(name.slice(0, 75).trim());

  // Make plural unit display friendly when quantity > 1 (e.g., 2 cans, 2 cups, 2 lbs)
  if (!unit && quantity > 0) {
    unit = '';
  }

  return {
    name,
    quantity: quantity > 0 ? quantity : 1,
    unit,
  };
}

export function extractRssItems(xml: string, limit = 5): Array<{ link: string; pubDate: string }> {
  const results: Array<{ link: string; pubDate: string }> = [];
  const seen = new Set<string>();
  const itemRegex = /<item\b[\s\S]*?<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[0];
    const linkMatch = /<link>([\s\S]*?)<\/link>/i.exec(block);
    const pubMatch = /<pubDate>([\s\S]*?)<\/pubDate>/i.exec(block);
    const rawLink = linkMatch ? cleanPlainText(linkMatch[1]) : '';
    const cleanedLink = cleanRecipeUrl(rawLink);
    if (!cleanedLink || seen.has(cleanedLink)) continue;

    seen.add(cleanedLink);
    results.push({
      link: cleanedLink,
      pubDate: pubMatch ? cleanPlainText(pubMatch[1]) : '',
    });
    if (results.length >= limit) break;
  }

  return results;
}

function findRecipeNode(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }

  const obj = node as Record<string, unknown>;
  const rawType = obj['@type'];
  const isRecipe =
    rawType === 'Recipe' ||
    (Array.isArray(rawType) && rawType.some((t) => String(t).toLowerCase() === 'recipe'));

  if (isRecipe && typeof obj.name === 'string') {
    return obj;
  }

  if (Array.isArray(obj['@graph'])) {
    const found = findRecipeNode(obj['@graph']);
    if (found) return found;
  }

  return null;
}

function extractImageUrl(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw.startsWith('http://') || raw.startsWith('https://') ? raw : '';
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const url = extractImageUrl(item);
      if (url) return url;
    }
    return '';
  }
  if (raw && typeof raw === 'object') {
    const rec = raw as Record<string, unknown>;
    if (typeof rec.url === 'string') return extractImageUrl(rec.url);
  }
  return '';
}

function normalizeTagList(
  rawCategories: unknown,
  rawCuisine: unknown,
  rawKeywords: unknown,
  name: string,
  totalMinutes: number | null,
  defaultTags: string[] = []
): string[] {
  const tokens: string[] = [];
  const collect = (val: unknown) => {
    if (typeof val === 'string') {
      tokens.push(...val.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (Array.isArray(val)) {
      for (const v of val) collect(v);
    }
  };

  collect(rawCategories);
  collect(rawCuisine);
  collect(rawKeywords);

  const haystack = `${name} ${tokens.join(' ')}`.toLowerCase();
  const tags = new Set<string>(defaultTags);

  if (totalMinutes !== null && totalMinutes <= 35) tags.add('Quick');
  if (/\b(crock\s*pot|slow\s*cooker)\b/.test(haystack)) tags.add('Crockpot');
  if (/\b(sheet\s*pan)\b/.test(haystack)) tags.add('Sheet Pan');
  if (/\b(one[\s-]pot|one[\s-]pan|skillet)\b/.test(haystack)) tags.add('One-Pot');
  if (/\b(vegetarian|meatless|vegan)\b/.test(haystack)) tags.add('Vegetarian');
  if (/\b(healthy|light|low[\s-]carb|high[\s-]protein|skinny)\b/.test(haystack)) tags.add('Healthy');
  if (/\b(budget|cheap|frugal)\b/.test(haystack)) tags.add('Budget');
  if (/\b(pasta|spaghetti|noodle|lasagna|ziti|tortellini|orzo)\b/.test(haystack)) tags.add('Pasta');
  if (/\b(soup|stew|chili|chowder)\b/.test(haystack)) tags.add('Soup & Chili');
  if (/\b(taco|burrito|enchilada|fajita|quesadilla|mexican|tex-mex)\b/.test(haystack)) tags.add('Mexican');
  if (/\b(italian|tuscan|parmesan|marinara|pesto)\b/.test(haystack)) tags.add('Italian');
  if (/\b(asian|thai|chinese|japanese|korean|teriyaki|stir[\s-]fry|curry|ramen)\b/.test(haystack)) tags.add('Asian');
  if (/\b(seafood|salmon|shrimp|fish|cod|tuna)\b/.test(haystack)) tags.add('Seafood');
  if (/\b(chicken|turkey)\b/.test(haystack)) tags.add('Chicken');
  if (/\b(beef|steak|meatball|burger)\b/.test(haystack)) tags.add('Beef');

  if (tags.size === 0) {
    tags.add('Dinner');
  }

  return Array.from(tags).slice(0, 4);
}

function truncateNotes(text: string, maxLen = 200): string {
  const cleaned = cleanPlainText(text);
  if (cleaned.length <= maxLen) return cleaned;
  const sliced = cleaned.slice(0, maxLen);
  const lastSpace = sliced.lastIndexOf(' ');
  return `${(lastSpace > 80 ? sliced.slice(0, lastSpace) : sliced).trim()}…`;
}

export function extractJsonLdRecipe(
  html: string,
  opts: {
    sourceUrl: string;
    sourceName: string;
    publishedAt?: string;
    defaultTags?: string[];
  }
): ParsedWebRecipe | null {
  const scriptRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  let recipeNode: Record<string, unknown> | null = null;

  while ((match = scriptRegex.exec(html)) !== null) {
    const rawJson = match[1].trim();
    if (!rawJson) continue;
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      recipeNode = findRecipeNode(parsed);
      if (recipeNode) break;
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }

  if (!recipeNode) return null;

  const name = cleanPlainText(String(recipeNode.name ?? ''));
  if (!name || name.length < 3) return null;

  const rawIngredients = Array.isArray(recipeNode.recipeIngredient)
    ? recipeNode.recipeIngredient
    : [];
  const ingredients: MealIdeaIngredient[] = [];
  const seenIng = new Set<string>();

  for (const rawLine of rawIngredients) {
    if (typeof rawLine !== 'string') continue;
    const parsedIng = parseIngredientLine(rawLine);
    if (!parsedIng) continue;
    const key = parsedIng.name.toLowerCase();
    if (seenIng.has(key)) continue;
    seenIng.add(key);
    ingredients.push(parsedIng);
    if (ingredients.length >= 16) break;
  }

  if (ingredients.length < 2) return null;

  const totalTime = formatIsoDuration(recipeNode.totalTime);
  const prepTimeOnly = formatIsoDuration(recipeNode.prepTime);
  const cookTimeOnly = formatIsoDuration(recipeNode.cookTime);
  const effectiveMinutes =
    totalTime.totalMinutes ??
    ((prepTimeOnly.totalMinutes ?? 0) + (cookTimeOnly.totalMinutes ?? 0) || null);
  const prepTimeLabel =
    totalTime.label ||
    (effectiveMinutes ? formatIsoDuration(`PT${effectiveMinutes}M`).label : '');

  const notes = truncateNotes(
    typeof recipeNode.description === 'string' && recipeNode.description.trim()
      ? recipeNode.description
      : `Fresh recipe from ${opts.sourceName}.`
  );

  const imageUrl = extractImageUrl(recipeNode.image);
  const tags = normalizeTagList(
    recipeNode.recipeCategory,
    recipeNode.recipeCuisine,
    recipeNode.keywords,
    name,
    effectiveMinutes,
    opts.defaultTags ?? []
  );

  const sourcePrefix = opts.sourceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 12);

  return {
    id: slugifyId(`web-${sourcePrefix || 'site'}`, name),
    name,
    notes,
    prepTime: prepTimeLabel || '30–45 min',
    tags,
    imageUrl,
    sourceName: opts.sourceName,
    sourceUrl: cleanRecipeUrl(opts.sourceUrl) || opts.sourceUrl,
    ingredients,
    publishedAt: opts.publishedAt ?? '',
  };
}

export function parseTheMealDbMeal(raw: Record<string, unknown>): ParsedWebRecipe | null {
  const idMeal = typeof raw.idMeal === 'string' ? raw.idMeal.trim() : '';
  const name = cleanPlainText(String(raw.strMeal ?? ''));
  if (!idMeal || !name) return null;

  const ingredients: MealIdeaIngredient[] = [];
  const seenIng = new Set<string>();

  for (let i = 1; i <= 20; i++) {
    const ingName = typeof raw[`strIngredient${i}`] === 'string'
      ? cleanPlainText(String(raw[`strIngredient${i}`]))
      : '';
    if (!ingName) continue;

    const measure = typeof raw[`strMeasure${i}`] === 'string'
      ? cleanPlainText(String(raw[`strMeasure${i}`]))
      : '';

    const combinedLine = measure ? `${measure} ${ingName}` : ingName;
    const parsed = parseIngredientLine(combinedLine) ?? {
      name: titleCaseIngredient(ingName),
      quantity: 1,
      unit: '',
    };

    const key = parsed.name.toLowerCase();
    if (seenIng.has(key)) continue;
    seenIng.add(key);
    ingredients.push(parsed);
  }

  if (ingredients.length < 2) return null;

  const instructions = typeof raw.strInstructions === 'string' ? cleanPlainText(raw.strInstructions) : '';
  const area = typeof raw.strArea === 'string' ? raw.strArea.trim() : '';
  const category = typeof raw.strCategory === 'string' ? raw.strCategory.trim() : '';
  const rawTags = typeof raw.strTags === 'string' ? raw.strTags : '';

  const notes = instructions
    ? truncateNotes(instructions, 185)
    : `${area ? `${area} ` : ''}${category || 'dinner'} recipe from TheMealDB.`;

  const tags = normalizeTagList(category, area, rawTags, name, null, []);
  if (area && area !== 'Unknown' && tags.length < 4 && !tags.includes(area)) {
    tags.push(area);
  }

  const rawSource = typeof raw.strSource === 'string' ? cleanRecipeUrl(raw.strSource) : '';
  const sourceUrl = rawSource || `https://www.themealdb.com/meal/${encodeURIComponent(idMeal)}`;
  const imageUrl =
    typeof raw.strMealThumb === 'string' && raw.strMealThumb.startsWith('http')
      ? raw.strMealThumb
      : '';

  return {
    id: `themealdb-${idMeal}`,
    name,
    notes,
    prepTime: '30–45 min',
    tags: tags.slice(0, 4),
    imageUrl,
    sourceName: 'TheMealDB',
    sourceUrl,
    ingredients,
    publishedAt: '',
  };
}
