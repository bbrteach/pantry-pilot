import type { Staple } from '../types';

export type StapleSortMode = 'auto' | 'az' | 'category';

export const STAPLE_CATEGORIES = [
  'Produce',
  'Dairy & Eggs',
  'Meat & Deli',
  'Bakery',
  'Pantry',
  'Frozen',
  'Beverages',
  'Snacks',
  'Household',
  'Personal Care',
  'Other',
] as const;

const CATEGORY_KEYWORDS: Array<{ category: string; keywords: string[] }> = [
  {
    category: 'Dairy & Eggs',
    keywords: [
      'milk',
      'almond milk',
      'oat milk',
      'soy milk',
      'egg',
      'butter',
      'cheese',
      'yogurt',
      'cream',
      'half and half',
      'half & half',
      'sour cream',
      'cottage cheese',
      'kefir',
      'creamer',
    ],
  },
  {
    category: 'Produce',
    keywords: [
      'banana',
      'apple',
      'orange',
      'berry',
      'berries',
      'strawberry',
      'blueberry',
      'grape',
      'lemon',
      'lime',
      'avocado',
      'tomato',
      'onion',
      'garlic',
      'potato',
      'lettuce',
      'spinach',
      'salad',
      'carrot',
      'celery',
      'broccoli',
      'cucumber',
      'pepper',
      'cilantro',
      'fruit',
      'veggie',
      'vegetable',
    ],
  },
  {
    category: 'Meat & Deli',
    keywords: [
      'chicken',
      'beef',
      'pork',
      'turkey',
      'bacon',
      'sausage',
      'ham',
      'deli',
      'lunch meat',
      'salmon',
      'fish',
      'shrimp',
      'steak',
    ],
  },
  {
    category: 'Bakery',
    keywords: [
      'bread',
      'garlic bread',
      'bagel',
      'bun',
      'tortilla',
      'muffin',
      'english muffin',
      'roll',
      'croissant',
      'pita',
      'naan',
    ],
  },
  {
    category: 'Beverages',
    keywords: [
      'water',
      'coffee',
      'tea',
      'juice',
      'orange juice',
      'apple juice',
      'soda',
      'seltzer',
      'sparkling',
      'la croix',
      'gatorade',
      'drink',
      'kombucha',
      'espresso',
      'lemonade',
    ],
  },
  {
    category: 'Snacks',
    keywords: [
      'chip',
      'cracker',
      'pretzel',
      'popcorn',
      'almond',
      'cashew',
      'peanut',
      'walnut',
      'nut',
      'granola',
      'protein bar',
      'snack',
      'cookie',
      'goldfish',
      'trail mix',
      'hummus',
      'salsa',
    ],
  },
  {
    category: 'Frozen',
    keywords: ['frozen', 'ice cream', 'waffle', 'popsicl', 'pizza', 'nugget', 'tater tot'],
  },
  {
    category: 'Household',
    keywords: [
      'paper towel',
      'toilet paper',
      'tissue',
      'napkin',
      'dish soap',
      'detergent',
      'laundry',
      'trash bag',
      'garbage bag',
      'foil',
      'plastic wrap',
      'parchment',
      'ziploc',
      'storage bag',
      'sponge',
      'cleaner',
      'bleach',
      'disinfect',
      'dryer sheet',
      'fabric softener',
      'dishwasher',
      'cat litter',
      'dog food',
      'pet food',
    ],
  },
  {
    category: 'Personal Care',
    keywords: [
      'toothpaste',
      'toothbrush',
      'shampoo',
      'conditioner',
      'body wash',
      'hand soap',
      'deodorant',
      'lotion',
      'floss',
      'mouthwash',
      'diaper',
      'baby wipe',
      'razor',
    ],
  },
  {
    category: 'Pantry',
    keywords: [
      'rice',
      'pasta',
      'cereal',
      'oat',
      'flour',
      'sugar',
      'oil',
      'olive oil',
      'vinegar',
      'sauce',
      'tomato sauce',
      'pasta sauce',
      'soup',
      'broth',
      'chicken broth',
      'beef broth',
      'bean',
      'peanut butter',
      'almond butter',
      'jam',
      'jelly',
      'honey',
      'maple syrup',
      'ketchup',
      'mustard',
      'mayo',
      'dressing',
      'seasoning',
      'spice',
      'salt',
      'baking',
    ],
  },
];

export function inferStapleCategory(name: string): string {
  const norm = name.trim().toLowerCase();
  if (!norm) return 'Other';
  let bestCategory = 'Other';
  let bestLen = 0;

  for (const entry of CATEGORY_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (norm.includes(kw) && kw.length > bestLen) {
        bestLen = kw.length;
        bestCategory = entry.category;
      }
    }
  }
  return bestCategory;
}

export function getEffectiveStapleCategory(
  staple: Pick<Staple, 'name' | 'category'>
): string {
  const explicit = staple.category?.trim();
  return explicit || inferStapleCategory(staple.name);
}

export function sortStaples(staples: Staple[], mode: StapleSortMode): Staple[] {
  const copy = [...staples];

  if (mode === 'az') {
    return copy.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  }

  if (mode === 'category') {
    return copy.sort((a, b) => {
      const catA = getEffectiveStapleCategory(a);
      const catB = getEffectiveStapleCategory(b);
      if (catA !== catB) {
        if (catA === 'Other') return 1;
        if (catB === 'Other') return -1;
        return catA.localeCompare(catB, undefined, { sensitivity: 'base' });
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }

  // 'auto': Auto-included staples on top, saved-only staples toward the bottom, A–Z within each group
  return copy.sort((a, b) => {
    const autoDiff = Number(b.autoInclude) - Number(a.autoInclude);
    if (autoDiff !== 0) return autoDiff;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

export interface StapleGroup {
  key: string;
  label: string;
  items: Staple[];
}

export function groupSortedStaples(
  staples: Staple[],
  mode: StapleSortMode
): StapleGroup[] {
  const sorted = sortStaples(staples, mode);
  if (sorted.length === 0) return [];

  if (mode === 'az') {
    return [{ key: 'all', label: '', items: sorted }];
  }

  if (mode === 'auto') {
    const autoItems = sorted.filter((s) => s.autoInclude);
    const savedOnlyItems = sorted.filter((s) => !s.autoInclude);
    const groups: StapleGroup[] = [];
    if (autoItems.length > 0) {
      groups.push({ key: 'auto-included', label: 'Auto-Included', items: autoItems });
    }
    if (savedOnlyItems.length > 0) {
      groups.push({ key: 'saved-only', label: 'Saved Only', items: savedOnlyItems });
    }
    return groups;
  }

  // 'category'
  const byCat = new Map<string, Staple[]>();
  for (const staple of sorted) {
    const cat = getEffectiveStapleCategory(staple);
    const list = byCat.get(cat) ?? [];
    list.push(staple);
    byCat.set(cat, list);
  }
  return Array.from(byCat.entries()).map(([cat, items]) => ({
    key: `cat-${cat.toLowerCase()}`,
    label: cat,
    items,
  }));
}
