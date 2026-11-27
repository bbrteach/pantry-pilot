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

initializeDatabase();

const app = express();
app.use(express.json());
app.use('/api/meals', mealsRouter);
app.use('/api/staples', staplesRouter);
app.use('/api/plan', planRouter);
app.use('/api/grocery-list', groceryListRouter);

let server: http.Server;
let baseUrl = '';

async function apiJson<T>(
  pathname: string,
  options?: { method?: string; body?: unknown }
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${baseUrl}${pathname}`, {
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
    db.prepare('DELETE FROM meal_plan_customizations').run();
    db.prepare('DELETE FROM meal_schedule_slots').run();
    db.prepare('DELETE FROM meal_plan_selections').run();
    db.prepare('DELETE FROM meal_ingredients').run();
    db.prepare('DELETE FROM meals').run();
    db.prepare('DELETE FROM staples').run();
    db.prepare('DELETE FROM grocery_list_items').run();
    db.prepare('DELETE FROM product_mappings').run();
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

    // Customize meal by swapping Pasta Sauce -> Vodka Sauce
    const custRes = await apiJson<{ customization: { swaps: Record<string, string> } }>(
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
    assert.equal(custRes.data.customization.swaps['pasta sauce'], 'Vodka Sauce');

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

  it('lists curated meal ideas and instantly adds an idea into the meal library', async () => {
    const ideasRes = await apiJson<
      Array<{
        id: string;
        name: string;
        prepTime: string;
        tags: string[];
        ingredients: Array<{ name: string; quantity: number; unit: string; alternatives: string[] }>;
        inLibrary: boolean;
      }>
    >('/api/meals/ideas');

    assert.equal(ideasRes.status, 200);
    assert.ok(ideasRes.data.length >= 20, 'Expected a rich catalog of meal ideas');
    const firstIdea = ideasRes.data[0];
    assert.equal(firstIdea.inLibrary, false);
    assert.ok(firstIdea.ingredients.length > 0);
    assert.ok(firstIdea.prepTime.length > 0);

    // Instant add to meal library
    const addRes = await apiJson<{
      id: number;
      name: string;
      tags: string[];
      ingredients: Array<{ name: string; alternatives: string[] }>;
    }>(`/api/meals/ideas/${encodeURIComponent(firstIdea.id)}/add`, {
      method: 'POST',
    });

    assert.equal(addRes.status, 201);
    assert.equal(addRes.data.name, firstIdea.name);
    assert.deepEqual(addRes.data.tags, firstIdea.tags);
    assert.equal(addRes.data.ingredients.length, firstIdea.ingredients.length);

    // Idea is now marked inLibrary
    const refreshedIdeas = await apiJson<Array<{ id: string; inLibrary: boolean }>>(
      '/api/meals/ideas'
    );
    assert.equal(refreshedIdeas.status, 200);
    assert.equal(
      refreshedIdeas.data.find((idea) => idea.id === firstIdea.id)?.inLibrary,
      true
    );

    // Duplicate add returns 409 Conflict
    const dupRes = await apiJson<{ error: string }>(
      `/api/meals/ideas/${encodeURIComponent(firstIdea.id)}/add`,
      { method: 'POST' }
    );
    assert.equal(dupRes.status, 409);

    // Unknown idea returns 404
    const missingRes = await apiJson<{ error: string }>('/api/meals/ideas/does-not-exist/add', {
      method: 'POST',
    });
    assert.equal(missingRes.status, 404);

    // Deleting meal from library makes idea addable again
    await apiJson(`/api/meals/${addRes.data.id}`, { method: 'DELETE' });
    const afterDeleteIdeas = await apiJson<Array<{ id: string; inLibrary: boolean }>>(
      '/api/meals/ideas'
    );
    assert.equal(
      afterDeleteIdeas.data.find((idea) => idea.id === firstIdea.id)?.inLibrary,
      false
    );
  });
});
