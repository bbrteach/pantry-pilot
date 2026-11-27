export type SizeDimension = 'weight' | 'volume' | 'count';

export interface ParsedProductSize {
  dimension: SizeDimension;
  /** Canonical amount: oz (weight), fl oz (volume), or count (count) */
  amount: number;
  raw: string;
}

const WEIGHT_TO_OZ: Record<string, number> = {
  oz: 1,
  ounce: 1,
  ounces: 1,
  lb: 16,
  lbs: 16,
  pound: 16,
  pounds: 16,
  g: 1 / 28.349523125,
  gram: 1 / 28.349523125,
  grams: 1 / 28.349523125,
  kg: 1000 / 28.349523125,
  kilogram: 1000 / 28.349523125,
  kilograms: 1000 / 28.349523125,
};

const VOLUME_TO_FL_OZ: Record<string, number> = {
  'fl oz': 1,
  floz: 1,
  'fluid oz': 1,
  'fluid ounce': 1,
  'fluid ounces': 1,
  gal: 128,
  gallon: 128,
  gallons: 128,
  qt: 32,
  quart: 32,
  quarts: 32,
  pt: 16,
  pint: 16,
  pints: 16,
  l: 33.8140227,
  liter: 33.8140227,
  liters: 33.8140227,
  litre: 33.8140227,
  litres: 33.8140227,
  ml: 0.0338140227,
  milliliter: 0.0338140227,
  milliliters: 0.0338140227,
};

const COUNT_TO_CT: Record<string, number> = {
  ct: 1,
  count: 1,
  pk: 1,
  pack: 1,
  packs: 1,
  ea: 1,
  each: 1,
  pc: 1,
  pcs: 1,
  piece: 1,
  pieces: 1,
  roll: 1,
  rolls: 1,
  bar: 1,
  bars: 1,
  pod: 1,
  pods: 1,
  pouch: 1,
  pouches: 1,
  slice: 1,
  slices: 1,
  sheet: 1,
  sheets: 1,
  wipe: 1,
  wipes: 1,
  bag: 1,
  bags: 1,
  can: 1,
  cans: 1,
  bottle: 1,
  bottles: 1,
  doz: 12,
  dozen: 12,
};

function parseQtyToken(raw: string): number | null {
  const cleaned = raw.trim();
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(cleaned);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den > 0) return whole + num / den;
  }
  const frac = /^(\d+)\/(\d+)$/.exec(cleaned);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    if (den > 0) return num / den;
  }
  const dec = Number(cleaned);
  return Number.isFinite(dec) && dec > 0 ? dec : null;
}

function classifyUnit(unitRaw: string): { dimension: SizeDimension; factor: number } | null {
  const normalized = unitRaw
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized in VOLUME_TO_FL_OZ) {
    return { dimension: 'volume', factor: VOLUME_TO_FL_OZ[normalized] };
  }
  if (normalized in WEIGHT_TO_OZ) {
    return { dimension: 'weight', factor: WEIGHT_TO_OZ[normalized] };
  }
  if (normalized in COUNT_TO_CT) {
    return { dimension: 'count', factor: COUNT_TO_CT[normalized] };
  }
  return null;
}

function parseSingleSizeText(text: string): ParsedProductSize | null {
  const cleaned = text
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;

  // Handle standalone "each" / "ea" / "1 dozen"
  if (/^(?:each|ea\.?)$/i.test(cleaned)) {
    return { dimension: 'count', amount: 1, raw: text };
  }

  // 1. Multipack of weight/volume:
  // e.g. "4 pk / 5 oz", "12 ct / 12 fl oz", "4 x 5 oz", "4-5 oz", "6 / 8 fl oz", "4 pack 5 oz"
  const multipackRe =
    /\b(\d+)\s*(?:(?:pk|pack|packs|ct|count|cans?|bottles?|boxes?|pouches?|bags?|bars?|rolls?|cups?|jars?|tubs?)\.?\s*(?:\/|x|-|of|,|\s)\s*|(?:\/|x|-)\s*)(\d+(?:\.\d+)?|\d+\/\d+)\s*(fl\.?\s*oz\.?|floz|fluid\s+ounces?|fluid\s+oz\.?|oz\.?|ounces?|lbs?\.?|pounds?|kg|kilograms?|g|grams?|ml|milliliters?|l|liters?|litres?|gal\.?|gallons?|qt\.?|quarts?|pt\.?|pints?)\b/i;
  const multiMatch = multipackRe.exec(cleaned);
  if (multiMatch) {
    const packCount = Number(multiMatch[1]);
    const eachQty = parseQtyToken(multiMatch[2]);
    const unitInfo = classifyUnit(multiMatch[3]);
    if (
      Number.isInteger(packCount) &&
      packCount >= 2 &&
      packCount <= 200 &&
      eachQty !== null &&
      unitInfo &&
      (unitInfo.dimension === 'weight' || unitInfo.dimension === 'volume')
    ) {
      return {
        dimension: unitInfo.dimension,
        amount: packCount * eachQty * unitInfo.factor,
        raw: text,
      };
    }
  }

  // 2. Standard weight or volume measurement (prioritize over count so "12 oz bag" parses as 12 oz):
  // e.g. "19 oz", "9 oz", "1.5 lb", "1/2 gal", "64 fl oz", "16 oz / 1 lb"
  const measureRe =
    /\b(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*(fl\.?\s*oz\.?|floz|fluid\s+ounces?|fluid\s+oz\.?|oz\.?|ounces?|lbs?\.?|pounds?|kg|kilograms?|g|grams?|ml|milliliters?|l|liters?|litres?|gal\.?|gallons?|qt\.?|quarts?|pt\.?|pints?)\b/i;
  const measureMatch = measureRe.exec(cleaned);
  if (measureMatch) {
    const qty = parseQtyToken(measureMatch[1]);
    const unitInfo = classifyUnit(measureMatch[2]);
    if (qty !== null && unitInfo) {
      return {
        dimension: unitInfo.dimension,
        amount: qty * unitInfo.factor,
        raw: text,
      };
    }
  }

  // 3. Count-based package size (e.g. "12 ct", "6 pack", "1 dozen", "18 rolls")
  const countRe =
    /\b(\d+(?:\.\d+)?)\s*(ct\.?|count|pk\.?|packs?|ea\.?|each|pcs?\.?|pieces?|rolls?|bars?|pods?|pouches?|slices?|sheets?|wipes?|bags?|cans?|bottles?|doz\.?|dozen)\b/i;
  const countMatch = countRe.exec(cleaned);
  if (countMatch) {
    const qty = parseQtyToken(countMatch[1]);
    const unitInfo = classifyUnit(countMatch[2]);
    if (qty !== null && unitInfo) {
      return {
        dimension: unitInfo.dimension,
        amount: qty * unitInfo.factor,
        raw: text,
      };
    }
  }

  return null;
}

/**
 * Parses Kroger product size string (falling back to product description if size is empty/unparseable).
 */
export function parseProductSize(size?: string | null, description?: string | null): ParsedProductSize | null {
  if (size) {
    const fromSize = parseSingleSizeText(size);
    if (fromSize) return fromSize;
  }
  if (description) {
    const fromDesc = parseSingleSizeText(description);
    if (fromDesc) return fromDesc;
  }
  return null;
}

export interface EquivalentQuantityComparison {
  /** Number of candidate packages needed to match (or exceed) the current total quantity */
  recommendedCartQuantity: number;
  /** Total cost of current mapped product for current cartQuantity */
  currentTotalCost: number;
  /** Total cost of candidate product for recommendedCartQuantity */
  candidateTotalCost: number;
  /** Total savings across the equivalent quantity (positive = genuinely cheaper) */
  totalSavings: number;
  /** Equivalent savings per unit of the user's current cart quantity */
  savingsPerCurrentUnit: number;
  /** Percentage saved on total cost for the same (or greater) total quantity */
  savingsPercent: number;
}

function roundMoney(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Compares a candidate alternative against the user's currently mapped product
 * for the SAME total quantity (or more).
 *
 * Examples:
 * - 19 oz @ $4.49 (qty 1) vs 9 oz @ $3.89 -> needs 3 × 9 oz = $11.67 -> NOT cheaper (null)
 * - 10 oz @ $2.49 (qty 1) vs 5 oz @ $1.39 -> needs 2 × 5 oz = $2.78 -> NOT cheaper (null)
 * - 10 oz @ $2.49 (qty 1) vs 5 oz @ $1.09 -> needs 2 × 5 oz = $2.18 -> CHEAPER! saves $0.31, recommendedCartQuantity = 2
 * - 24 oz @ $4.99 (qty 2) vs 24 oz @ $2.79 -> needs 2 × 24 oz = $5.58 vs $9.98 -> CHEAPER! saves $4.40, recommendedCartQuantity = 2
 */
export function compareAlternativeForSameQuantity(params: {
  currentSize: ParsedProductSize | null;
  currentEffectivePrice: number;
  currentCartQuantity: number;
  candidateSize: ParsedProductSize | null;
  candidateEffectivePrice: number;
  minTotalSavings?: number;
}): EquivalentQuantityComparison | null {
  const {
    currentSize,
    currentEffectivePrice,
    currentCartQuantity,
    candidateSize,
    candidateEffectivePrice,
    minTotalSavings = 0.1,
  } = params;

  // Require both products to have parseable sizes in the same dimension (weight vs weight, volume vs volume, count vs count)
  if (!currentSize || !candidateSize) return null;
  if (currentSize.dimension !== candidateSize.dimension) return null;
  if (currentSize.amount <= 0 || candidateSize.amount <= 0) return null;

  const qty = Math.max(1, Math.floor(currentCartQuantity || 1));
  const targetTotalAmount = currentSize.amount * qty;

  // Allow a tiny 2% rounding tolerance (e.g., 454 g vs 16 oz or 15.8 oz vs 16 oz)
  const TOLERANCE = 0.98;
  const recommendedCartQuantity = Math.max(
    1,
    Math.ceil((targetTotalAmount * TOLERANCE) / candidateSize.amount)
  );

  // Avoid impractical recommendations requiring way too many tiny packages (max 4x unit multiplier)
  if (recommendedCartQuantity > qty * 4) return null;

  const currentTotalCost = roundMoney(currentEffectivePrice * qty);
  const candidateTotalCost = roundMoney(candidateEffectivePrice * recommendedCartQuantity);
  const totalSavings = roundMoney(currentTotalCost - candidateTotalCost);

  if (totalSavings < minTotalSavings) return null;

  // Also ensure unit price (cost per oz / fl oz / count) is strictly better
  const currentUnitPrice = currentTotalCost / targetTotalAmount;
  const candidateTotalAmount = candidateSize.amount * recommendedCartQuantity;
  const candidateUnitPrice = candidateTotalCost / candidateTotalAmount;
  if (candidateUnitPrice >= currentUnitPrice) return null;

  const savingsPerCurrentUnit = roundMoney(totalSavings / qty);
  const savingsPercent = Math.max(1, Math.round((totalSavings / currentTotalCost) * 100));

  return {
    recommendedCartQuantity,
    currentTotalCost,
    candidateTotalCost,
    totalSavings,
    savingsPerCurrentUnit,
    savingsPercent,
  };
}
