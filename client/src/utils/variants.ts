export interface QuickSidePreset {
  name: string;
  quantity: number;
  unit: string;
  category: 'Vegetable' | 'Side';
}

export const QUICK_SIDE_PRESETS: QuickSidePreset[] = [
  { name: 'Steamed Broccoli', quantity: 1, unit: 'bag', category: 'Vegetable' },
  { name: 'Green Beans', quantity: 1, unit: 'bag', category: 'Vegetable' },
  { name: 'Caesar Salad Kit', quantity: 1, unit: 'bag', category: 'Vegetable' },
  { name: 'Roasted Asparagus', quantity: 1, unit: 'bunch', category: 'Vegetable' },
  { name: 'Sweet Corn', quantity: 1, unit: 'bag', category: 'Vegetable' },
  { name: 'Glazed Carrots', quantity: 1, unit: 'bag', category: 'Vegetable' },
  { name: 'Roasted Zucchini', quantity: 2, unit: 'whole', category: 'Vegetable' },
  { name: 'Mixed Side Salad', quantity: 1, unit: 'bag', category: 'Vegetable' },
  { name: 'Roasted Brussels Sprouts', quantity: 1, unit: 'bag', category: 'Vegetable' },
  { name: 'Garlic Bread', quantity: 1, unit: 'loaf', category: 'Side' },
  { name: 'Mashed Potatoes', quantity: 1, unit: 'pack', category: 'Side' },
  { name: 'Baked Sweet Potatoes', quantity: 4, unit: 'whole', category: 'Side' },
  { name: 'Rice Pilaf', quantity: 1, unit: 'box', category: 'Side' },
  { name: 'Mac & Cheese', quantity: 1, unit: 'box', category: 'Side' },
  { name: 'Dinner Rolls', quantity: 1, unit: 'pack', category: 'Side' },
];

interface VariantGroup {
  keywords: string[];
  label: string;
  options: string[];
}

const VARIANT_GROUPS: VariantGroup[] = [
  {
    label: 'Pasta Type',
    keywords: [
      'pasta',
      'spaghetti',
      'penne',
      'rotini',
      'rigatoni',
      'fettuccine',
      'linguine',
      'macaroni',
      'farfalle',
      'bowtie',
      'ziti',
      'noodles',
    ],
    options: [
      'Penne Pasta',
      'Spaghetti',
      'Rotini Pasta',
      'Rigatoni Pasta',
      'Bowtie Pasta',
      'Fettuccine',
      'Whole Wheat Pasta',
      'Gluten-Free Pasta',
    ],
  },
  {
    label: 'Pasta Sauce',
    keywords: ['marinara', 'pasta sauce', 'alfredo', 'vodka sauce', 'pesto', 'spaghetti sauce'],
    options: [
      'Marinara Sauce',
      'Roasted Garlic Marinara',
      'Alfredo Sauce',
      'Vodka Sauce',
      'Basil Pesto Sauce',
      'Meat Sauce',
      'Spicy Arrabbiata Sauce',
    ],
  },
  {
    label: 'Ground Meat',
    keywords: ['ground beef', 'ground turkey', 'ground chicken', 'ground pork'],
    options: [
      'Ground Beef',
      'Lean Ground Beef (93/7)',
      'Ground Turkey',
      'Ground Chicken',
      'Italian Sausage',
      'Plant-Based Crumbles',
    ],
  },
  {
    label: 'Chicken Cut',
    keywords: ['chicken breast', 'chicken thigh', 'chicken tender', 'rotisserie chicken'],
    options: [
      'Chicken Breast',
      'Boneless Chicken Thighs',
      'Chicken Tenderloins',
      'Rotisserie Chicken',
      'Extra-Firm Tofu',
    ],
  },
  {
    label: 'Fish / Seafood',
    keywords: ['salmon', 'tilapia', 'cod', 'shrimp', 'mahi'],
    options: ['Salmon Fillets', 'Tilapia Fillets', 'Cod Fillets', 'Large Shrimp'],
  },
  {
    label: 'Pork Cut',
    keywords: ['pork shoulder', 'pork loin', 'pork chop', 'pork tenderloin'],
    options: ['Pork Shoulder', 'Pork Tenderloin', 'Boneless Pork Chops', 'Chicken Thighs'],
  },
  {
    label: 'Shredded Cheese',
    keywords: ['cheddar', 'mozzarella', 'monterey jack', 'mexican blend', 'colby jack', 'pepper jack', 'shredded cheese'],
    options: [
      'Shredded Cheddar Cheese',
      'Shredded Sharp Cheddar',
      'Shredded Mild Cheddar',
      'Shredded Mexican Blend',
      'Shredded Mozzarella',
      'Colby Jack Cheese',
      'Pepper Jack Cheese',
      'Monterey Jack Cheese',
    ],
  },
  {
    label: 'Tortillas / Shells',
    keywords: ['tortilla', 'taco shell', 'wrap'],
    options: [
      'Flour Tortillas',
      'Corn Tortillas',
      'Whole Wheat Tortillas',
      'Low-Carb Tortillas',
      'Crunchy Taco Shells',
    ],
  },
  {
    label: 'Buns / Bread',
    keywords: ['brioche bun', 'hamburger bun', 'hot dog bun', 'garlic bread', 'sandwich bread', 'bread'],
    options: [
      'Brioche Buns',
      'Pretzel Buns',
      'Whole Wheat Buns',
      'Hawaiian Sweet Rolls',
      'Sourdough Bread',
      'Garlic Bread',
    ],
  },
  {
    label: 'Rice / Grain',
    keywords: ['rice', 'quinoa', 'couscous', 'farro'],
    options: ['Jasmine Rice', 'Brown Rice', 'Basmati Rice', 'Cauliflower Rice', 'Quinoa'],
  },
  {
    label: 'Beans',
    keywords: ['black beans', 'kidney beans', 'pinto beans', 'cannellini', 'chickpeas', 'garbanzo'],
    options: ['Black Beans', 'Pinto Beans', 'Kidney Beans', 'Cannellini Beans', 'Chickpeas'],
  },
  {
    label: 'Salsa',
    keywords: ['salsa', 'pico de gallo'],
    options: ['Mild Salsa', 'Medium Salsa', 'Hot Salsa', 'Salsa Verde', 'Fresh Pico de Gallo'],
  },
  {
    label: 'BBQ Sauce',
    keywords: ['bbq sauce', 'barbecue sauce'],
    options: ['Original BBQ Sauce', 'Honey BBQ Sauce', 'Hickory Smoked BBQ Sauce', 'Sweet & Spicy BBQ Sauce', 'Carolina Gold BBQ Sauce'],
  },
  {
    label: 'Green Vegetable',
    keywords: ['broccoli', 'asparagus', 'spinach', 'green beans', 'zucchini', 'cauliflower', 'kale'],
    options: ['Broccoli Florets', 'Cauliflower Florets', 'Green Beans', 'Asparagus', 'Baby Spinach', 'Zucchini'],
  },
];

export function normalizeIngKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeSwapList(raw: string | string[] | undefined | null): string[] {
  const arr = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const item of arr) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().replace(/\s+/g, ' ');
    if (!trimmed) continue;
    const key = normalizeIngKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    clean.push(trimmed);
  }
  return clean;
}

export function getSuggestedVariantsForIngredient(ingredientName: string): {
  categoryLabel: string | null;
  options: string[];
} {
  const norm = normalizeIngKey(ingredientName);
  for (const group of VARIANT_GROUPS) {
    if (group.keywords.some((kw) => norm.includes(kw))) {
      return {
        categoryLabel: group.label,
        options: group.options,
      };
    }
  }
  return { categoryLabel: null, options: [] };
}

export function resolveIngredientVariantOptions(
  ingredientName: string,
  manualAlternatives?: string[]
): {
  categoryLabel: string | null;
  manualOptions: string[];
  suggestedOptions: string[];
} {
  const baseName = ingredientName.trim();
  const baseNorm = normalizeIngKey(baseName);
  const seenManual = new Set<string>(baseNorm ? [baseNorm] : []);
  const cleanManual: string[] = [];

  for (const alt of manualAlternatives ?? []) {
    const trimmed = alt.trim().replace(/\s+/g, ' ');
    if (!trimmed) continue;
    const norm = normalizeIngKey(trimmed);
    if (!norm || seenManual.has(norm)) continue;
    seenManual.add(norm);
    cleanManual.push(trimmed);
  }

  const manualOptions = cleanManual.length > 0 && baseName ? [baseName, ...cleanManual] : [];
  const { categoryLabel, options: autoOptions } = getSuggestedVariantsForIngredient(baseName);

  if (manualOptions.length > 0) {
    const suggestedOptions = autoOptions.filter((opt) => !seenManual.has(normalizeIngKey(opt)));
    return {
      categoryLabel,
      manualOptions,
      suggestedOptions,
    };
  }

  if (autoOptions.length > 0 && baseName) {
    const hasBase = autoOptions.some((opt) => normalizeIngKey(opt) === baseNorm);
    return {
      categoryLabel,
      manualOptions: [],
      suggestedOptions: hasBase ? autoOptions : [baseName, ...autoOptions],
    };
  }

  return {
    categoryLabel,
    manualOptions: [],
    suggestedOptions: autoOptions,
  };
}
