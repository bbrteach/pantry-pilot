import { db } from './database.js';
import { normalizeIngredientName } from '../services/consolidation.js';

interface SeedMeal {
  name: string;
  notes: string;
  tags: string[];
  ingredients: Array<{ name: string; quantity: number; unit: string }>;
}

interface SeedStaple {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  autoInclude: boolean;
}

const SAMPLE_MEALS: SeedMeal[] = [
  {
    name: 'Weeknight Beef Tacos',
    notes: 'Brown beef with taco seasoning; serve with warm tortillas, shredded cheese, and salsa.',
    tags: ['Quick', 'Family Favorite'],
    ingredients: [
      { name: 'Ground Beef', quantity: 1, unit: 'lb' },
      { name: 'Yellow Onion', quantity: 1, unit: 'whole' },
      { name: 'Shredded Cheddar Cheese', quantity: 2, unit: 'cups' },
      { name: 'Flour Tortillas', quantity: 1, unit: 'pack' },
      { name: 'Taco Seasoning', quantity: 1, unit: 'pack' },
      { name: 'Salsa', quantity: 1, unit: 'jar' },
    ],
  },
  {
    name: 'Crockpot Beef & Bean Chili',
    notes: 'Cook on low for 6–8 hours. Great leftovers for lunches the next day.',
    tags: ['Crockpot', 'Family Favorite'],
    ingredients: [
      { name: 'Ground Beef', quantity: 1.5, unit: 'lbs' },
      { name: 'Yellow Onion', quantity: 1, unit: 'whole' },
      { name: 'Garlic', quantity: 3, unit: 'cloves' },
      { name: 'Kidney Beans', quantity: 2, unit: 'cans' },
      { name: 'Diced Tomatoes', quantity: 2, unit: 'cans' },
      { name: 'Shredded Cheddar Cheese', quantity: 1, unit: 'lb' },
    ],
  },
  {
    name: 'Sheet Pan Lemon Garlic Chicken',
    notes: 'Roast at 425°F for 25 minutes with broccoli florets and baby potatoes.',
    tags: ['Quick', 'Healthy', 'Sheet Pan'],
    ingredients: [
      { name: 'Chicken Breast', quantity: 2, unit: 'lbs' },
      { name: 'Broccoli Florets', quantity: 1, unit: 'bag' },
      { name: 'Baby Potatoes', quantity: 1.5, unit: 'lbs' },
      { name: 'Garlic', quantity: 4, unit: 'cloves' },
      { name: 'Lemon', quantity: 2, unit: 'whole' },
    ],
  },
  {
    name: 'Creamy Garlic Parmesan Pasta',
    notes: 'One-pot pasta with spinach and Parmesan; ready in 20 minutes.',
    tags: ['Quick', 'Vegetarian'],
    ingredients: [
      { name: 'Penne Pasta', quantity: 1, unit: 'box' },
      { name: 'Heavy Cream', quantity: 1, unit: 'cup' },
      { name: 'Baby Spinach', quantity: 1, unit: 'bag' },
      { name: 'Garlic', quantity: 3, unit: 'cloves' },
      { name: 'Grated Parmesan', quantity: 1, unit: 'cup' },
      { name: 'Chicken Broth', quantity: 2, unit: 'cups' },
    ],
  },
  {
    name: 'Crockpot Salsa Verde Chicken Bowls',
    notes: 'Shred chicken after 4 hours on high and serve over jasmine rice with black beans.',
    tags: ['Crockpot', 'Healthy'],
    ingredients: [
      { name: 'Chicken Breast', quantity: 2, unit: 'lbs' },
      { name: 'Salsa Verde', quantity: 1, unit: 'jar' },
      { name: 'Black Beans', quantity: 2, unit: 'cans' },
      { name: 'Jasmine Rice', quantity: 2, unit: 'cups' },
      { name: 'Avocado', quantity: 2, unit: 'whole' },
    ],
  },
  {
    name: 'Honey Garlic Salmon & Asparagus',
    notes: 'Glaze fillets with honey, soy sauce, and minced garlic; broil 10–12 minutes.',
    tags: ['Quick', 'Healthy'],
    ingredients: [
      { name: 'Salmon Fillets', quantity: 1.5, unit: 'lbs' },
      { name: 'Asparagus', quantity: 1, unit: 'bunch' },
      { name: 'Jasmine Rice', quantity: 1.5, unit: 'cups' },
      { name: 'Garlic', quantity: 2, unit: 'cloves' },
      { name: 'Soy Sauce', quantity: 1, unit: 'bottle' },
    ],
  },
  {
    name: 'Classic Spaghetti & Meatballs',
    notes: 'Simmer marinara with frozen or homemade meatballs; serve with garlic bread.',
    tags: ['Family Favorite', 'Quick'],
    ingredients: [
      { name: 'Spaghetti', quantity: 1, unit: 'box' },
      { name: 'Marinara Sauce', quantity: 1, unit: 'jar' },
      { name: 'Frozen Meatballs', quantity: 1, unit: 'bag' },
      { name: 'Grated Parmesan', quantity: 0.5, unit: 'cup' },
      { name: 'Garlic Bread', quantity: 1, unit: 'loaf' },
    ],
  },
  {
    name: 'Crockpot Pulled Pork Sandwiches',
    notes: 'Slow-cook pork shoulder with BBQ sauce and serve on brioche buns with coleslaw.',
    tags: ['Crockpot', 'Family Favorite'],
    ingredients: [
      { name: 'Pork Shoulder', quantity: 3, unit: 'lbs' },
      { name: 'BBQ Sauce', quantity: 1, unit: 'bottle' },
      { name: 'Brioche Buns', quantity: 1, unit: 'pack' },
      { name: 'Coleslaw Mix', quantity: 1, unit: 'bag' },
      { name: 'Yellow Onion', quantity: 1, unit: 'whole' },
    ],
  },
  {
    name: 'Chicken Stir-Fry',
    notes: 'Quick wok sear with bell peppers, broccoli, and ginger-soy glaze.',
    tags: ['Quick', 'Healthy'],
    ingredients: [
      { name: 'Chicken Breast', quantity: 1.5, unit: 'lbs' },
      { name: 'Broccoli Florets', quantity: 1, unit: 'bag' },
      { name: 'Bell Peppers', quantity: 3, unit: 'whole' },
      { name: 'Jasmine Rice', quantity: 2, unit: 'cups' },
      { name: 'Chicken Broth', quantity: 1, unit: 'can' },
    ],
  },
  {
    name: 'Veggie & Black Bean Quesadillas',
    notes: 'Crisp in skillet with bell peppers, black beans, and cheddar cheese.',
    tags: ['Quick', 'Vegetarian', 'Budget'],
    ingredients: [
      { name: 'Flour Tortillas', quantity: 1, unit: 'pack' },
      { name: 'Black Beans', quantity: 1, unit: 'can' },
      { name: 'Bell Peppers', quantity: 2, unit: 'whole' },
      { name: 'Shredded Cheddar Cheese', quantity: 2, unit: 'cups' },
      { name: 'Salsa', quantity: 1, unit: 'jar' },
    ],
  },
];

const SAMPLE_STAPLES: SeedStaple[] = [
  { name: 'Bottled Water', quantity: 1, unit: 'case', category: 'Beverages', autoInclude: true },
  { name: 'Whole Milk', quantity: 1, unit: 'gallon', category: 'Dairy & Eggs', autoInclude: true },
  { name: 'Large Eggs', quantity: 1, unit: 'dozen', category: 'Dairy & Eggs', autoInclude: true },
  { name: 'Paper Towels', quantity: 1, unit: 'pack', category: 'Household', autoInclude: true },
  { name: 'Bananas', quantity: 1, unit: 'bunch', category: 'Produce', autoInclude: true },
  { name: 'Whole Wheat Bread', quantity: 1, unit: 'loaf', category: 'Bakery', autoInclude: true },
  { name: 'Salted Butter', quantity: 1, unit: 'box', category: 'Dairy & Eggs', autoInclude: false },
  { name: 'Coffee Beans', quantity: 1, unit: 'bag', category: 'Beverages', autoInclude: false },
];

export function seedDatabaseIfEmpty(): void {
  const mealCount = db.prepare('SELECT COUNT(*) as count FROM meals').get() as { count: number };
  const stapleCount = db.prepare('SELECT COUNT(*) as count FROM staples').get() as { count: number };

  if (mealCount.count === 0) {
    const insertMeal = db.prepare(
      'INSERT INTO meals (name, notes, tags) VALUES (?, ?, ?)'
    );
    const insertIngredient = db.prepare(
      'INSERT INTO meal_ingredients (meal_id, name, normalized_name, quantity, unit) VALUES (?, ?, ?, ?, ?)'
    );

    const seedMealsTx = db.transaction(() => {
      for (const meal of SAMPLE_MEALS) {
        const result = insertMeal.run(meal.name, meal.notes, JSON.stringify(meal.tags));
        const mealId = Number(result.lastInsertRowid);
        for (const ing of meal.ingredients) {
          insertIngredient.run(
            mealId,
            ing.name,
            normalizeIngredientName(ing.name),
            ing.quantity,
            ing.unit
          );
        }
      }
    });

    seedMealsTx();
  }

  if (stapleCount.count === 0) {
    const insertStaple = db.prepare(
      'INSERT INTO staples (name, normalized_name, quantity, unit, category, auto_include) VALUES (?, ?, ?, ?, ?, ?)'
    );

    const seedStaplesTx = db.transaction(() => {
      for (const staple of SAMPLE_STAPLES) {
        insertStaple.run(
          staple.name,
          normalizeIngredientName(staple.name),
          staple.quantity,
          staple.unit,
          staple.category,
          staple.autoInclude ? 1 : 0
        );
      }
    });

    seedStaplesTx();
  }
}
