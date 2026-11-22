export interface UnitAmount {
  quantity: number;
  unit: string;
}

export interface ConsolidationInput {
  name: string;
  quantity: number;
  unit: string;
  source: string;
}

export interface ConsolidatedItem {
  name: string;
  normalizedName: string;
  unitBreakdown: UnitAmount[];
  quantityDisplay: string;
  sources: string[];
  cartQuantity: number;
}

const UNIT_ALIASES: Record<string, string> = {
  lb: 'lb',
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  cup: 'cup',
  cups: 'cup',
  c: 'cup',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  clove: 'clove',
  cloves: 'clove',
  can: 'can',
  cans: 'can',
  jar: 'jar',
  jars: 'jar',
  bag: 'bag',
  bags: 'bag',
  box: 'box',
  boxes: 'box',
  pack: 'pack',
  packs: 'pack',
  pkg: 'pack',
  package: 'pack',
  packages: 'pack',
  bottle: 'bottle',
  bottles: 'bottle',
  case: 'case',
  cases: 'case',
  gallon: 'gallon',
  gallons: 'gallon',
  gal: 'gallon',
  quart: 'quart',
  quarts: 'quart',
  qt: 'quart',
  pint: 'pint',
  pints: 'pint',
  dozen: 'dozen',
  doz: 'dozen',
  bunch: 'bunch',
  bunches: 'bunch',
  head: 'head',
  heads: 'head',
  loaf: 'loaf',
  loaves: 'loaf',
  roll: 'roll',
  rolls: 'roll',
  slice: 'slice',
  slices: 'slice',
  count: 'ct',
  ct: 'ct',
  each: '',
  whole: '',
  piece: '',
  pieces: '',
};

const PLURAL_UNITS: Record<string, string> = {
  lb: 'lbs',
  cup: 'cups',
  clove: 'cloves',
  can: 'cans',
  jar: 'jars',
  bag: 'bags',
  box: 'boxes',
  pack: 'packs',
  bottle: 'bottles',
  case: 'cases',
  gallon: 'gallons',
  quart: 'quarts',
  pint: 'pints',
  bunch: 'bunches',
  head: 'heads',
  loaf: 'loaves',
  roll: 'rolls',
  slice: 'slices',
};

export function normalizeIngredientName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeUnit(unit: string): string {
  const cleaned = unit.trim().toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ');
  if (!cleaned) return '';
  return UNIT_ALIASES[cleaned] ?? cleaned;
}

export function roundQuantity(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatNumber(value: number): string {
  const rounded = roundQuantity(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

export function formatSingleUnitAmount(item: UnitAmount): string {
  const qty = roundQuantity(item.quantity);
  const qtyText = formatNumber(qty);
  const unit = normalizeUnit(item.unit);
  if (!unit) return qtyText;
  const displayUnit = qty !== 1 && PLURAL_UNITS[unit] ? PLURAL_UNITS[unit] : unit;
  return `${qtyText} ${displayUnit}`;
}

export function formatUnitBreakdown(breakdown: UnitAmount[]): string {
  if (!breakdown.length) return '1';
  return breakdown.map(formatSingleUnitAmount).join(' + ');
}

export function computeDefaultCartQuantity(breakdown: UnitAmount[]): number {
  if (breakdown.length === 1) {
    const unit = normalizeUnit(breakdown[0].unit);
    const qty = breakdown[0].quantity;
    // Countable container units map directly to cart quantity
    const countableUnits = new Set([
      '',
      'can',
      'jar',
      'bag',
      'box',
      'pack',
      'bottle',
      'case',
      'gallon',
      'quart',
      'pint',
      'dozen',
      'bunch',
      'head',
      'loaf',
    ]);
    if (countableUnits.has(unit)) {
      return Math.max(1, Math.ceil(qty));
    }
  }
  return 1;
}

export function consolidateIngredients(inputs: ConsolidationInput[]): ConsolidatedItem[] {
  const groups = new Map<
    string,
    {
      displayName: string;
      units: Map<string, number>;
      sources: Set<string>;
    }
  >();

  for (const input of inputs) {
    const trimmedName = input.name.trim().replace(/\s+/g, ' ');
    if (!trimmedName) continue;

    const normalizedName = normalizeIngredientName(trimmedName);
    const normalizedUnit = normalizeUnit(input.unit || '');
    const quantity = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 1;

    let group = groups.get(normalizedName);
    if (!group) {
      group = {
        displayName: trimmedName,
        units: new Map<string, number>(),
        sources: new Set<string>(),
      };
      groups.set(normalizedName, group);
    }

    const prevQty = group.units.get(normalizedUnit) ?? 0;
    group.units.set(normalizedUnit, roundQuantity(prevQty + quantity));
    if (input.source.trim()) {
      group.sources.add(input.source.trim());
    }
  }

  const results: ConsolidatedItem[] = [];
  for (const [normalizedName, group] of groups.entries()) {
    const unitBreakdown: UnitAmount[] = Array.from(group.units.entries()).map(
      ([unit, quantity]) => ({
        quantity: roundQuantity(quantity),
        unit,
      })
    );
    results.push({
      name: group.displayName,
      normalizedName,
      unitBreakdown,
      quantityDisplay: formatUnitBreakdown(unitBreakdown),
      sources: Array.from(group.sources),
      cartQuantity: computeDefaultCartQuantity(unitBreakdown),
    });
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}
