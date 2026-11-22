import { Router } from 'express';
import { db } from '../db/database.js';
import { normalizeIngredientName } from '../services/consolidation.js';

export const mealsRouter = Router();

interface MealRow {
  id: number;
  name: string;
  notes: string;
  tags: string;
  image_url: string;
  created_at: string;
  updated_at: string;
}

interface IngredientRow {
  id: number;
  meal_id: number;
  name: string;
  normalized_name: string;
  quantity: number;
  unit: string;
}

interface IngredientInput {
  name: string;
  quantity: number;
  unit?: string;
}

function hydrateMeals(mealRows: MealRow[]) {
  if (mealRows.length === 0) return [];
  const mealIds = mealRows.map((m) => m.id);
  const placeholders = mealIds.map(() => '?').join(',');
  const ingredients = db
    .prepare(
      `SELECT id, meal_id, name, normalized_name, quantity, unit
       FROM meal_ingredients
       WHERE meal_id IN (${placeholders})
       ORDER BY id ASC`
    )
    .all(...mealIds) as IngredientRow[];

  const byMeal = new Map<number, IngredientRow[]>();
  for (const ing of ingredients) {
    const list = byMeal.get(ing.meal_id) ?? [];
    list.push(ing);
    byMeal.set(ing.meal_id, list);
  }

  return mealRows.map((row) => ({
    id: row.id,
    name: row.name,
    notes: row.notes,
    tags: JSON.parse(row.tags || '[]') as string[],
    imageUrl: row.image_url || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ingredients: (byMeal.get(row.id) ?? []).map((ing) => ({
      id: ing.id,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
    })),
  }));
}

function parseMealPayload(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  const rawImageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  const imageUrl =
    rawImageUrl === '' ||
    rawImageUrl.startsWith('/api/uploads/') ||
    rawImageUrl.startsWith('https://') ||
    rawImageUrl.startsWith('http://')
      ? rawImageUrl
      : '';
  const rawTags = Array.isArray(body.tags) ? body.tags : [];
  const tags = Array.from(
    new Set(
      rawTags
        .filter((t): t is string => typeof t === 'string')
        .map((t) => t.trim())
        .filter(Boolean)
    )
  );

  const rawIngredients = Array.isArray(body.ingredients) ? body.ingredients : [];
  const ingredients: IngredientInput[] = [];
  for (const item of rawIngredients) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const ingName = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!ingName) continue;
    const parsedQty = Number(rec.quantity);
    const quantity = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
    const unit = typeof rec.unit === 'string' ? rec.unit.trim() : '';
    ingredients.push({ name: ingName, quantity, unit });
  }

  return { name, notes, tags, imageUrl, ingredients };
}

mealsRouter.get('/', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const tag = typeof req.query.tag === 'string' ? req.query.tag.trim().toLowerCase() : '';

  const rows = db
    .prepare('SELECT id, name, notes, tags, image_url, created_at, updated_at FROM meals ORDER BY name COLLATE NOCASE ASC')
    .all() as MealRow[];

  let meals = hydrateMeals(rows);

  if (tag && tag !== 'all') {
    meals = meals.filter((m) => m.tags.some((t) => t.toLowerCase() === tag));
  }

  if (search) {
    meals = meals.filter(
      (m) =>
        m.name.toLowerCase().includes(search) ||
        m.notes.toLowerCase().includes(search) ||
        m.tags.some((t) => t.toLowerCase().includes(search)) ||
        m.ingredients.some((i) => i.name.toLowerCase().includes(search))
    );
  }

  res.json(meals);
});

mealsRouter.post('/', (req, res) => {
  const { name, notes, tags, imageUrl, ingredients } = parseMealPayload(req.body ?? {});

  if (!name) {
    res.status(400).json({ error: 'Meal name is required.' });
    return;
  }
  if (ingredients.length === 0) {
    res.status(400).json({ error: 'Please include at least one ingredient.' });
    return;
  }

  const createTx = db.transaction(() => {
    const result = db
      .prepare(
        "INSERT INTO meals (name, notes, tags, image_url, updated_at) VALUES (?, ?, ?, ?, datetime('now'))"
      )
      .run(name, notes, JSON.stringify(tags), imageUrl);
    const mealId = Number(result.lastInsertRowid);

    const insertIng = db.prepare(
      'INSERT INTO meal_ingredients (meal_id, name, normalized_name, quantity, unit) VALUES (?, ?, ?, ?, ?)'
    );
    for (const ing of ingredients) {
      insertIng.run(mealId, ing.name, normalizeIngredientName(ing.name), ing.quantity, ing.unit ?? '');
    }
    return mealId;
  });

  const mealId = createTx();
  const row = db
    .prepare('SELECT id, name, notes, tags, image_url, created_at, updated_at FROM meals WHERE id = ?')
    .get(mealId) as MealRow;

  res.status(201).json(hydrateMeals([row])[0]);
});

mealsRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid meal ID.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM meals WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Meal not found.' });
    return;
  }

  const { name, notes, tags, imageUrl, ingredients } = parseMealPayload(req.body ?? {});
  if (!name) {
    res.status(400).json({ error: 'Meal name is required.' });
    return;
  }
  if (ingredients.length === 0) {
    res.status(400).json({ error: 'Please include at least one ingredient.' });
    return;
  }

  const updateTx = db.transaction(() => {
    db.prepare(
      "UPDATE meals SET name = ?, notes = ?, tags = ?, image_url = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(name, notes, JSON.stringify(tags), imageUrl, id);

    db.prepare('DELETE FROM meal_ingredients WHERE meal_id = ?').run(id);
    const insertIng = db.prepare(
      'INSERT INTO meal_ingredients (meal_id, name, normalized_name, quantity, unit) VALUES (?, ?, ?, ?, ?)'
    );
    for (const ing of ingredients) {
      insertIng.run(id, ing.name, normalizeIngredientName(ing.name), ing.quantity, ing.unit ?? '');
    }
  });

  updateTx();

  const row = db
    .prepare('SELECT id, name, notes, tags, image_url, created_at, updated_at FROM meals WHERE id = ?')
    .get(id) as MealRow;

  res.json(hydrateMeals([row])[0]);
});

mealsRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid meal ID.' });
    return;
  }

  const result = db.prepare('DELETE FROM meals WHERE id = ?').run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Meal not found.' });
    return;
  }

  res.json({ deleted: true, id });
});
