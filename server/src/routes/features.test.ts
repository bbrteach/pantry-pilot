import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';

// Isolate SQLite database before importing app modules
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantrypilot-features-test-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test.db');

const { db, initializeDatabase } = await import('../db/database.js');
const { mealsRouter, sanitizeIngredientAlternatives } = await import('./meals.js');
const { staplesRouter } = await import('./staples.js');
const { planRouter } = await import('./plan.js');
const { groceryListRouter } = await import('./groceryList.js');
const { parseIngredientLine, extractJsonLdRecipe } = await import('../services/recipeParser.js');

initializeDatabase();

const app = express();
app.use(express.json());
app.use('/api/meals', mealsRouter);
app.use('/api/staples', staplesRouter);
app.use('/api/plan', planRouter);
app.use('/api/grocery-list', groceryListRouter);

let server: http.Server;
let baseUrl = '';
const originalFetch = globalThis.fetch;

async function apiJson<T>(
  pathname: string,
  options?: { method?: string; body?: unknown }
): Promise<{ status: number; data: T }> {
  const res = await originalFetch(`${baseUrl}${pathname}`, {
    method: options?.method ?? 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

describe('Manual Ingredient Alternatives & Individual Staple Add-to-List', () => {
  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        assert.ok(addr && typeof addr === 'object');
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  beforeEach(() => {
    globalThis.fetch = originalFetch;
    db.prepare('DELETE FROM meal_plan_customizations').run();
    db.prepare('DELETE FROM meal_schedule_slots').run();
    db.prepare('DELETE FROM meal_plan_selections').run();
    db.prepare('DELETE FROM meal_ingredients').run();
    db.prepare('DELETE FROM meals').run();
    db.prepare('DELETE FROM staples').run();
    db.prepare('DELETE FROM grocery_list_items').run();
    db.prepare('DELETE FROM product_mappings').run();
    db.prepare('DELETE FROM meal_ideas_cache').run();
    db.prepare('DELETE FROM app_settings').run();
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('sanitizes manual ingredient alternatives by trimming, deduping, and excluding base ingredient', () => {
    const cleaned = sanitizeIngredientAlternatives(
      [
        '  Alfredo Sauce ',
        'marinara sauce', // matches base ingredient
        'Vodka Sauce',
        'alfredo   sauce', // duplicate
        '',
        '   ',
        'Basil Pesto',
      ],
      'Marinara Sauce'
    );
    assert.deepEqual(cleaned, ['Alfredo Sauce', 'Vodka Sauce', 'Basil Pesto']);
  });

  it('creates, reads, searches, and updates meals with manual ingredient alternatives', async () => {
    const createRes = await apiJson<{
      id: number;
      name: string;
      ingredients: Array<{ name: string; quantity: number; unit: string; alternatives: string[] }>;
    }>('/api/meals', {
      method: 'POST',
      body: {
        name: 'Custom Pasta Night',
        notes: 'Swap sauces depending on mood',
        tags: ['Quick'],
        ingredients: [
          {
            name: 'Pasta Sauce',
            quantity: 1,
            unit: 'jar',
            alternatives: ["Rao's Marinara", 'Creamy Alfredo', 'pasta sauce', 'Basil Pesto'],
          },
          {
            name: 'Penne Pasta',
            quantity: 1,
            unit: 'box',
          },
        ],
      },
    });

    assert.equal(createRes.status, 201);
    assert.equal(createRes.data.ingredients.length, 2);
    assert.deepEqual(createRes.data.ingredients[0].alternatives, [
      "Rao's Marinara",
      'Creamy Alfredo',
      'Basil Pesto',
    ]);
    assert.deepEqual(createRes.data.ingredients[1].alternatives, []);

    // Search matches by manual alternative name
    const searchRes = await apiJson<Array<{ id: number; name: string }>>(
      '/api/meals?search=creamy%20alfredo'
    );
    assert.equal(searchRes.status, 200);
    assert.equal(searchRes.data.length, 1);
    assert.equal(searchRes.data[0].id, createRes.data.id);

    // Update meal alternatives
    const updateRes = await apiJson<{
      id: number;
      ingredients: Array<{ name: string; alternatives: string[] }>;
    }>(`/api/meals/${createRes.data.id}`, {
      method: 'PUT',
      body: {
        name: 'Custom Pasta Night',
        notes: 'Updated sauces',
        tags: ['Quick'],
        ingredients: [
          {
            name: 'Pasta Sauce',
            quantity: 1,
            unit: 'jar',
            alternatives: ['Spicy Arrabbiata', 'Four Cheese Rosa'],
          },
          {
            name: 'Penne Pasta',
            quantity: 1,
            unit: 'box',
            alternatives: ['Rigatoni'],
          },
        ],
      },
    });

    assert.equal(updateRes.status, 200);
    assert.deepEqual(updateRes.data.ingredients[0].alternatives, [
      'Spicy Arrabbiata',
      'Four Cheese Rosa',
    ]);
    assert.deepEqual(updateRes.data.ingredients[1].alternatives, ['Rigatoni']);
  });

  it('applies a chosen manual alternative during meal customization and grocery list generation', async () => {
    const mealRes = await apiJson<{ id: number }>('/api/meals', {
      method: 'POST',
      body: {
        name: 'Baked Ziti',
        notes: '',
        tags: [],
        ingredients: [
          {
            name: 'Pasta Sauce',
            quantity: 2,
            unit: 'jar',
            alternatives: ['Vodka Sauce', 'Roasted Garlic Sauce'],
          },
          { name: 'Ziti Pasta', quantity: 1, unit: 'box', alternatives: [] },
        ],
      },
    });
    const mealId = mealRes.data.id;

    // Customize meal by swapping Pasta Sauce -> Vodka Sauce (legacy string input still supported)
    const custRes = await apiJson<{ customization: { swaps: Record<string, string[]> } }>(
      `/api/plan/customizations/${mealId}`,
      {
        method: 'PUT',
        body: {
          sides: [],
          swaps: { 'pasta sauce': 'Vodka Sauce' },
        },
      }
    );
    assert.equal(custRes.status, 200);
    assert.deepEqual(custRes.data.customization.swaps['pasta sauce'], ['Vodka Sauce']);

    const genRes = await apiJson<{
      items: Array<{ name: string; quantityDisplay: string }>;
    }>('/api/grocery-list/generate', {
      method: 'POST',
      body: { mealIds: [mealId] },
    });
    assert.equal(genRes.status, 200);
    const names = genRes.data.items.map((i) => i.name);
    assert.ok(names.includes('Vodka Sauce'));
    assert.ok(!names.includes('Pasta Sauce'));
    const vodka = genRes.data.items.find((i) => i.name === 'Vodka Sauce');
    assert.equal(vodka?.quantityDisplay, '2 jars');
  });

  it('allows selecting multiple swap variants for a single ingredient and adds all chosen variants to the grocery list', async () => {
    const mealRes = await apiJson<{ id: number }>('/api/meals', {
      method: 'POST',
      body: {
        name: 'Taco Bar Night',
        notes: 'Everyone picks their favorite cheeses',
        tags: ['Family Favorite'],
        ingredients: [
          {
            name: 'Medium Shredded Cheddar',
            quantity: 1,
            unit: 'bag',
            alternatives: [
              'Shredded Mozzarella',
              'Shredded Sharp Cheddar',
              'Shredded Mild Cheddar',
              'Shredded Mexican Blend',
            ],
          },
          { name: 'Flour Tortillas', quantity: 1, unit: 'pack', alternatives: [] },
        ],
      },
    });
    const mealId = mealRes.data.id;

    // Select 4 cheese variants at once
    const multiRes = await apiJson<{ customization: { swaps: Record<string, string[]> } }>(
      `/api/plan/customizations/${mealId}`,
      {
        method: 'PUT',
        body: {
          sides: [],
          swaps: {
            'medium shredded cheddar': [
              'Shredded Mozzarella',
              'Shredded Sharp Cheddar',
              'Shredded Mild Cheddar',
              'Shredded Mexican Blend',
              'shredded mozzarella', // duplicate ignored
            ],
          },
        },
      }
    );

    assert.equal(multiRes.status, 200);
    assert.deepEqual(multiRes.data.customization.swaps['medium shredded cheddar'], [
      'Shredded Mozzarella',
      'Shredded Sharp Cheddar',
      'Shredded Mild Cheddar',
      'Shredded Mexican Blend',
    ]);

    const genRes = await apiJson<{
      items: Array<{ name: string; quantityDisplay: string }>;
    }>('/api/grocery-list/generate', {
      method: 'POST',
      body: { mealIds: [mealId] },
    });
    assert.equal(genRes.status, 200);
    const names = genRes.data.items.map((i) => i.name);
    assert.ok(!names.includes('Medium Shredded Cheddar'));
    assert.ok(names.includes('Shredded Mozzarella'));
    assert.ok(names.includes('Shredded Sharp Cheddar'));
    assert.ok(names.includes('Shredded Mild Cheddar'));
    assert.ok(names.includes('Shredded Mexican Blend'));
    assert.ok(names.includes('Flour Tortillas'));

    // Also supports keeping the original ingredient alongside additional variants
    const keepOrigRes = await apiJson<{ customization: { swaps: Record<string, string[]> } }>(
      `/api/plan/customizations/${mealId}`,
      {
        method: 'PUT',
        body: {
          sides: [],
          swaps: {
            'medium shredded cheddar': ['Medium Shredded Cheddar', 'Shredded Mozzarella'],
          },
        },
      }
    );
    assert.equal(keepOrigRes.status, 200);
    assert.deepEqual(keepOrigRes.data.customization.swaps['medium shredded cheddar'], [
      'Medium Shredded Cheddar',
      'Shredded Mozzarella',
    ]);

    const genBothRes = await apiJson<{ items: Array<{ name: string }> }>(
      '/api/grocery-list/generate',
      { method: 'POST', body: { mealIds: [mealId] } }
    );
    const bothNames = genBothRes.data.items.map((i) => i.name);
    assert.ok(bothNames.includes('Medium Shredded Cheddar'));
    assert.ok(bothNames.includes('Shredded Mozzarella'));
  });

  it('clears the entire meal planner (selected meals, customizations, and all schedule slots including MYOD & Restaurant)', async () => {
    const mealRes = await apiJson<{ id: number }>('/api/meals', {
      method: 'POST',
      body: {
        name: 'Reset Test Tacos',
        notes: '',
        tags: [],
        ingredients: [{ name: 'Ground Beef', quantity: 1, unit: 'lb' }],
      },
    });
    const mealId = mealRes.data.id;

    // Select meal, add customization, and populate meal + MYOD + Restaurant schedule slots
    await apiJson(`/api/plan/customizations/${mealId}`, {
      method: 'PUT',
      body: {
        sides: [{ id: 's1', name: 'Steamed Broccoli', quantity: 1, unit: 'bag' }],
        swaps: { 'ground beef': ['Ground Turkey'] },
      },
    });
    db.prepare(
      `INSERT INTO meal_schedule_slots (week_number, day_of_week, entry_type, meal_id)
       VALUES (1, 1, 'meal', ?), (1, 5, 'myod', NULL), (1, 6, 'restaurant', NULL)`
    ).run(mealId);

    const resetRes = await apiJson<{
      mealIds: number[];
      customizations: Record<string, unknown>;
      slots: unknown[];
    }>('/api/plan', { method: 'DELETE' });

    assert.equal(resetRes.status, 200);
    assert.deepEqual(resetRes.data.mealIds, []);
    assert.deepEqual(resetRes.data.customizations, {});
    assert.deepEqual(resetRes.data.slots, []);

    const planAfter = await apiJson<{ mealIds: number[]; customizations: Record<string, unknown> }>(
      '/api/plan'
    );
    assert.deepEqual(planAfter.data.mealIds, []);
    assert.deepEqual(planAfter.data.customizations, {});

    const slotsRemaining = db
      .prepare('SELECT COUNT(*) as cnt FROM meal_schedule_slots')
      .get() as { cnt: number };
    assert.equal(slotsRemaining.cnt, 0);
  });

  it('adds an individual non-auto staple to the active grocery list/cart, merges duplicates, and restores checked items', async () => {
    // Create a non-auto staple
    const stapleRes = await apiJson<{ id: number; name: string; autoInclude: boolean }>(
      '/api/staples',
      {
        method: 'POST',
        body: { name: 'Coffee Beans', quantity: 1, unit: 'bag', autoInclude: false },
      }
    );
    assert.equal(stapleRes.status, 201);
    assert.equal(stapleRes.data.autoInclude, false);
    const stapleId = stapleRes.data.id;

    // Pre-map Coffee Beans to a Kroger product to verify cart readiness
    db.prepare(
      `INSERT INTO product_mappings (normalized_name, upc, product_id, description, brand, size, last_price)
       VALUES ('coffee beans', '0001111000011', 'p-1', 'Kroger French Roast', 'Kroger', '12 oz', 7.99)`
    ).run();

    // 1. Add staple to empty list
    const addRes = await apiJson<{
      action: string;
      item: {
        id: number;
        name: string;
        quantityDisplay: string;
        sources: string[];
        cartQuantity: number;
        isChecked: boolean;
        productMapping: { upc: string } | null;
      };
      items: Array<{ id: number }>;
    }>(`/api/grocery-list/staples/${stapleId}`, { method: 'POST' });

    assert.equal(addRes.status, 201);
    assert.equal(addRes.data.action, 'added');
    assert.equal(addRes.data.item.name, 'Coffee Beans');
    assert.equal(addRes.data.item.quantityDisplay, '1 bag');
    assert.deepEqual(addRes.data.item.sources, ['Staple']);
    assert.equal(addRes.data.item.cartQuantity, 1);
    assert.equal(addRes.data.item.isChecked, false);
    assert.equal(addRes.data.item.productMapping?.upc, '0001111000011');
    assert.equal(addRes.data.items.length, 1);

    // 2. Tap again while active -> merges/increments rather than duplicating
    const incRes = await apiJson<{
      action: string;
      item: { id: number; quantityDisplay: string; cartQuantity: number; sources: string[] };
      items: Array<{ id: number }>;
    }>(`/api/grocery-list/staples/${stapleId}`, { method: 'POST' });

    assert.equal(incRes.status, 200);
    assert.equal(incRes.data.action, 'incremented');
    assert.equal(incRes.data.item.id, addRes.data.item.id);
    assert.equal(incRes.data.item.quantityDisplay, '2 bags');
    assert.equal(incRes.data.item.cartQuantity, 2);
    assert.deepEqual(incRes.data.item.sources, ['Staple']);
    assert.equal(incRes.data.items.length, 1);

    // 3. Check item off as already in pantry, then add staple again -> restores to active with staple default qty
    await apiJson(`/api/grocery-list/items/${addRes.data.item.id}`, {
      method: 'PATCH',
      body: { isChecked: true },
    });

    const restoreRes = await apiJson<{
      action: string;
      item: { id: number; isChecked: boolean; quantityDisplay: string; cartQuantity: number };
    }>(`/api/grocery-list/staples/${stapleId}`, { method: 'POST' });

    assert.equal(restoreRes.status, 200);
    assert.equal(restoreRes.data.action, 'restored');
    assert.equal(restoreRes.data.item.isChecked, false);
    assert.equal(restoreRes.data.item.quantityDisplay, '1 bag');
    assert.equal(restoreRes.data.item.cartQuantity, 1);

    // 4. Error handling for invalid/missing staple IDs
    const badRes = await apiJson<{ error: string }>('/api/grocery-list/staples/abc', {
      method: 'POST',
    });
    assert.equal(badRes.status, 400);

    const missingRes = await apiJson<{ error: string }>('/api/grocery-list/staples/99999', {
      method: 'POST',
    });
    assert.equal(missingRes.status, 404);
  });

  it('persists, preserves, and updates optional category on staples', async () => {
    const createRes = await apiJson<{
      id: number;
      name: string;
      category: string;
      autoInclude: boolean;
    }>('/api/staples', {
      method: 'POST',
      body: {
        name: 'Greek Yogurt',
        quantity: 2,
        unit: 'tubs',
        category: '  Dairy & Eggs  ',
        autoInclude: true,
      },
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.data.category, 'Dairy & Eggs');

    // Toggling autoInclude without sending category preserves existing category
    const toggleRes = await apiJson<{ id: number; category: string; autoInclude: boolean }>(
      `/api/staples/${createRes.data.id}`,
      {
        method: 'PUT',
        body: { autoInclude: false },
      }
    );
    assert.equal(toggleRes.status, 200);
    assert.equal(toggleRes.data.autoInclude, false);
    assert.equal(toggleRes.data.category, 'Dairy & Eggs');

    // Updating category explicitly saves the new category
    const recatRes = await apiJson<{ id: number; category: string }>(
      `/api/staples/${createRes.data.id}`,
      {
        method: 'PUT',
        body: { category: 'Snacks' },
      }
    );
    assert.equal(recatRes.status, 200);
    assert.equal(recatRes.data.category, 'Snacks');

    const listRes = await apiJson<Array<{ id: number; category: string }>>('/api/staples');
    assert.equal(listRes.status, 200);
    assert.equal(listRes.data[0].category, 'Snacks');
  });

  it('clears the entire shopping list including both active and checked items', async () => {
    const itemA = await apiJson<{ id: number }>('/api/grocery-list/items', {
      method: 'POST',
      body: { name: 'Milk', quantity: 1, unit: 'gallon' },
    });
    const itemB = await apiJson<{ id: number }>('/api/grocery-list/items', {
      method: 'POST',
      body: { name: 'Eggs', quantity: 1, unit: 'dozen' },
    });
    assert.equal(itemA.status, 201);
    assert.equal(itemB.status, 201);

    // Check off one item to verify both active and checked items get removed
    await apiJson(`/api/grocery-list/items/${itemB.data.id}`, {
      method: 'PATCH',
      body: { isChecked: true },
    });

    const clearRes = await apiJson<{ deletedCount: number }>('/api/grocery-list', {
      method: 'DELETE',
    });
    assert.equal(clearRes.status, 200);
    assert.equal(clearRes.data.deletedCount, 2);

    const remaining = await apiJson<Array<{ id: number }>>('/api/grocery-list');
    assert.equal(remaining.status, 200);
    assert.equal(remaining.data.length, 0);

    // Clearing an already empty list succeeds cleanly with deletedCount 0
    const clearAgain = await apiJson<{ deletedCount: number }>('/api/grocery-list', {
      method: 'DELETE',
    });
    assert.equal(clearAgain.status, 200);
    assert.equal(clearAgain.data.deletedCount, 0);
  });

  it('switches all auto-include staples to saved only in one bulk request', async () => {
    await apiJson('/api/staples', {
      method: 'POST',
      body: { name: 'Whole Milk', quantity: 1, unit: 'gallon', category: 'Dairy & Eggs', autoInclude: true },
    });
    await apiJson('/api/staples', {
      method: 'POST',
      body: { name: 'Bananas', quantity: 1, unit: 'bunch', category: 'Produce', autoInclude: true },
    });
    await apiJson('/api/staples', {
      method: 'POST',
      body: { name: 'Coffee Beans', quantity: 1, unit: 'bag', category: 'Beverages', autoInclude: false },
    });

    const bulkRes = await apiJson<{
      updatedCount: number;
      staples: Array<{ name: string; autoInclude: boolean; category: string }>;
    }>('/api/staples/auto-include', {
      method: 'PATCH',
      body: { autoInclude: false },
    });

    assert.equal(bulkRes.status, 200);
    assert.equal(bulkRes.data.updatedCount, 2);
    assert.equal(bulkRes.data.staples.length, 3);
    assert.ok(bulkRes.data.staples.every((s) => s.autoInclude === false));
    assert.equal(
      bulkRes.data.staples.find((s) => s.name === 'Whole Milk')?.category,
      'Dairy & Eggs'
    );

    // Calling again when all are already saved only updates 0 rows
    const secondRes = await apiJson<{ updatedCount: number }>('/api/staples/auto-include', {
      method: 'PATCH',
      body: { autoInclude: false },
    });
    assert.equal(secondRes.status, 200);
    assert.equal(secondRes.data.updatedCount, 0);

    // Invalid payload rejected
    const badRes = await apiJson<{ error: string }>('/api/staples/auto-include', {
      method: 'PATCH',
      body: { autoInclude: 'no' },
    });
    assert.equal(badRes.status, 400);
  });

  it('returns empty stale feed before first live refresh and rejects unknown idea IDs', async () => {
    const ideasRes = await apiJson<{
      ideas: Array<{ id: string }>;
      stale: boolean;
      liveCount: number;
    }>('/api/meals/ideas');

    assert.equal(ideasRes.status, 200);
    assert.equal(ideasRes.data.ideas.length, 0);
    assert.equal(ideasRes.data.liveCount, 0);
    assert.equal(ideasRes.data.stale, true);

    const missingRes = await apiJson<{ error: string }>('/api/meals/ideas/does-not-exist/add', {
      method: 'POST',
    });
    assert.equal(missingRes.status, 404);
  });

  it('parses recipe ingredient lines and Schema.org JSON-LD recipe pages accurately', () => {
    const ing1 = parseIngredientLine('1½ cups shredded cheddar cheese, divided ($1.80)');
    assert.deepEqual(ing1, { name: 'Shredded Cheddar Cheese', quantity: 1.5, unit: 'cup' });

    const ing2 = parseIngredientLine('2 (15 oz) cans black beans, drained and rinsed');
    assert.deepEqual(ing2, { name: 'Black Beans', quantity: 2, unit: 'can' });

    const ing3 = parseIngredientLine('3 large eggs');
    assert.deepEqual(ing3, { name: 'Eggs', quantity: 3, unit: 'whole' });

    const html = `
      <html><head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Recipe",
                "name": "One-Pan Garlic Butter Chicken &amp; Rice",
                "description": "Juicy seared chicken simmered with garlicky jasmine rice.",
                "image": { "@type": "ImageObject", "url": "https://cdn.example.com/garlic-chicken.jpg" },
                "totalTime": "PT30M",
                "recipeCategory": ["Dinner"],
                "recipeIngredient": [
                  "2 lbs boneless skinless chicken thighs",
                  "1 1/2 cups jasmine rice",
                  "3 cups chicken broth",
                  "4 cloves garlic, minced"
                ]
              }
            ]
          }
        </script>
      </head></html>
    `;

    const parsed = extractJsonLdRecipe(html, {
      sourceUrl: 'https://www.budgetbytes.com/garlic-butter-chicken/?utm_source=rss',
      sourceName: 'Budget Bytes',
      defaultTags: ['Budget'],
    });

    assert.ok(parsed);
    assert.equal(parsed.name, 'One-Pan Garlic Butter Chicken & Rice');
    assert.equal(parsed.prepTime, '30 min');
    assert.equal(parsed.imageUrl, 'https://cdn.example.com/garlic-chicken.jpg');
    assert.equal(parsed.sourceUrl, 'https://www.budgetbytes.com/garlic-butter-chicken/');
    assert.ok(parsed.tags.includes('Budget'));
    assert.ok(parsed.tags.includes('Quick'));
    assert.equal(parsed.ingredients.length, 4);
    assert.equal(parsed.ingredients[0].quantity, 2);
    assert.equal(parsed.ingredients[0].unit, 'lb');
  });

  it('refreshes live meal ideas from recipe website RSS feeds & TheMealDB, supports web search & URL import, and adds live recipes with photo to Meal Library', async () => {
    const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0"><channel>
        <item>
          <link>https://www.budgetbytes.com/smoky-skillet-fajitas/?utm_source=rss</link>
          <pubDate>Fri, 27 Nov 2026 12:00:00 +0000</pubDate>
        </item>
      </channel></rss>`;

    const sampleRecipeHtml = `<html><head><script type="application/ld+json">{
      "@context": "https://schema.org",
      "@type": "Recipe",
      "name": "Smoky Skillet Beef Fajitas",
      "description": "Sizzling weeknight fajitas ready in 25 minutes.",
      "image": ["https://images.example.com/fajitas.jpg"],
      "totalTime": "PT25M",
      "recipeCuisine": "Mexican",
      "recipeIngredient": [
        "1.5 lbs flank steak, sliced thin",
        "3 bell peppers, sliced",
        "1 yellow onion, sliced",
        "1 pack flour tortillas"
      ]
    }</script></head></html>`;

    const importedRecipeHtml = `<html><head><script type="application/ld+json">{
      "@context": "https://schema.org",
      "@type": "Recipe",
      "name": "Crispy Honey Lemon Chicken",
      "description": "Bright pan-seared chicken in a sticky lemon glaze.",
      "image": "https://images.example.com/honey-lemon.jpg",
      "totalTime": "PT20M",
      "recipeIngredient": [
        "2 lbs chicken breast",
        "2 lemons",
        "1/3 cup honey"
      ]
    }</script></head></html>`;

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('budgetbytes.com/category/recipes/main-dish/feed')) {
        return new Response(sampleRss, { status: 200 });
      }
      if (url.includes('budgetbytes.com/smoky-skillet-fajitas')) {
        return new Response(sampleRecipeHtml, { status: 200 });
      }
      if (url.includes('themealdb.com/api/json/v1/1/random.php')) {
        return new Response(
          JSON.stringify({
            meals: [
              {
                idMeal: '52999',
                strMeal: 'Creamy Mushroom Risotto',
                strCategory: 'Vegetarian',
                strArea: 'Italian',
                strInstructions: 'Slowly stir warm broth into arborio rice with sauteed mushrooms.',
                strMealThumb: 'https://www.themealdb.com/images/media/meals/risotto.jpg',
                strSource: 'https://example.org/risotto',
                strIngredient1: 'Arborio Rice',
                strMeasure1: '2 cups',
                strIngredient2: 'Mushrooms',
                strMeasure2: '8 oz',
                strIngredient3: 'Vegetable Broth',
                strMeasure3: '4 cups',
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url.includes('themealdb.com/api/json/v1/1/search.php?s=lasagna')) {
        return new Response(
          JSON.stringify({
            meals: [
              {
                idMeal: '52844',
                strMeal: 'Classic Beef Lasagna',
                strCategory: 'Pasta',
                strArea: 'Italian',
                strInstructions: 'Layer noodles, rich beef marinara, and ricotta cheese.',
                strMealThumb: 'https://www.themealdb.com/images/media/meals/lasagna.jpg',
                strIngredient1: 'Ground Beef',
                strMeasure1: '1 lb',
                strIngredient2: 'Lasagna Noodles',
                strMeasure2: '1 box',
                strIngredient3: 'Marinara Sauce',
                strMeasure3: '1 jar',
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url === 'https://allrecipes.example.com/crispy-honey-lemon-chicken/') {
        return new Response(importedRecipeHtml, { status: 200 });
      }
      return new Response('', { status: 404 });
    }) as typeof fetch;

    try {
      // 1. Refresh pulls fresh live recipes from RSS + TheMealDB and caches them
      const refreshRes = await apiJson<{
        ideas: Array<{
          id: string;
          name: string;
          sourceName: string;
          imageUrl: string;
          isLive: boolean;
        }>;
        stale: boolean;
        liveCount: number;
        lastRefreshedAt: string | null;
      }>('/api/meals/ideas/refresh', { method: 'POST' });

      assert.equal(refreshRes.status, 200);
      assert.equal(refreshRes.data.stale, false);
      assert.ok(refreshRes.data.lastRefreshedAt);
      assert.equal(refreshRes.data.liveCount, 2);

      const fajitas = refreshRes.data.ideas.find((i) => i.name === 'Smoky Skillet Beef Fajitas');
      const risotto = refreshRes.data.ideas.find((i) => i.name === 'Creamy Mushroom Risotto');
      assert.ok(fajitas, 'Expected RSS + JSON-LD recipe from Budget Bytes');
      assert.equal(fajitas.sourceName, 'Budget Bytes');
      assert.equal(fajitas.isLive, true);
      assert.equal(fajitas.imageUrl, 'https://images.example.com/fajitas.jpg');
      assert.ok(risotto, 'Expected live recipe from TheMealDB');
      assert.equal(risotto.sourceName, 'TheMealDB');

      // 2. Instant-add a live web recipe into the Meal Library preserves imageUrl and ingredients
      const addLiveRes = await apiJson<{
        id: number;
        name: string;
        imageUrl: string;
        ingredients: Array<{ name: string }>;
      }>(`/api/meals/ideas/${encodeURIComponent(fajitas.id)}/add`, { method: 'POST' });
      assert.equal(addLiveRes.status, 201);
      assert.equal(addLiveRes.data.name, 'Smoky Skillet Beef Fajitas');
      assert.equal(addLiveRes.data.imageUrl, 'https://images.example.com/fajitas.jpg');
      assert.equal(addLiveRes.data.ingredients.length, 4);

      // 3. Live web search finds & caches online recipes
      const searchRes = await apiJson<{
        query: string;
        results: Array<{ id: string; name: string; sourceName: string }>;
      }>('/api/meals/ideas/search?q=lasagna');
      assert.equal(searchRes.status, 200);
      assert.equal(searchRes.data.results.length, 1);
      assert.equal(searchRes.data.results[0].name, 'Classic Beef Lasagna');

      // 4. Import recipe from any public URL
      const importRes = await apiJson<{
        idea: { id: string; name: string; imageUrl: string; ingredients: Array<{ name: string }> };
      }>('/api/meals/ideas/import-url', {
        method: 'POST',
        body: { url: 'https://allrecipes.example.com/crispy-honey-lemon-chicken/' },
      });
      assert.equal(importRes.status, 201);
      assert.equal(importRes.data.idea.name, 'Crispy Honey Lemon Chicken');
      assert.equal(importRes.data.idea.ingredients.length, 3);

      // 5. Reject localhost / private network SSRF attempts
      const ssrfRes = await apiJson<{ error: string }>('/api/meals/ideas/import-url', {
        method: 'POST',
        body: { url: 'http://127.0.0.1:3001/api/health' },
      });
      assert.equal(ssrfRes.status, 400);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
