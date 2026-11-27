import { Router } from 'express';
import { db } from '../db/database.js';
import { normalizeIngredientName } from '../services/consolidation.js';
import {
  findMealIdeaById,
  getMealIdeasFeed,
  importMealIdeaFromUrl,
  refreshLiveMealIdeas,
  searchLiveMealIdeas,
} from '../services/mealIdeasService.js';

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
  alternatives: string;
}

interface IngredientInput {
  name: string;
  quantity: number;
  unit?: string;
  alternatives: string[];
}

export function sanitizeIngredientAlternatives(raw: unknown, baseIngredientName: string): string[] {
  if (!Array.isArray(raw)) return [];
  const baseNorm = normalizeIngredientName(baseIngredientName);
  const seen = new Set<string>(baseNorm ? [baseNorm] : []);
  const result: string[] = [];

  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!trimmed) continue;
    const norm = normalizeIngredientName(trimmed);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    result.push(trimmed);
  }
  return result;
}

function parseStoredAlternatives(raw: string | null | undefined, baseName: string): string[] {
  if (!raw) return [];
  try {
    return sanitizeIngredientAlternatives(JSON.parse(raw), baseName);
  } catch {
    return [];
  }
}

function hydrateMeals(mealRows: MealRow[]) {
  if (mealRows.length === 0) return [];
  const mealIds = mealRows.map((m) => m.id);
  const placeholders = mealIds.map(() => '?').join(',');
  const ingredients = db
    .prepare(
      `SELECT id, meal_id, name, normalized_name, quantity, unit, alternatives
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
      alternatives: parseStoredAlternatives(ing.alternatives, ing.name),
    })),
  }));
}

export function parseMealPayload(body: Record<string, unknown>) {
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
    const alternatives = sanitizeIngredientAlternatives(rec.alternatives, ingName);
    ingredients.push({ name: ingName, quantity, unit, alternatives });
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
        m.ingredients.some(
          (i) =>
            i.name.toLowerCase().includes(search) ||
            i.alternatives.some((alt) => alt.toLowerCase().includes(search))
        )
    );
  }

  res.json(meals);
});

mealsRouter.get('/ideas', (_req, res) => {
  res.json(getMealIdeasFeed());
});

mealsRouter.post('/ideas/refresh', async (_req, res) => {
  try {
    const feed = await refreshLiveMealIdeas();
    res.json(feed);
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Could not refresh live recipe ideas.',
    });
  }
});

mealsRouter.get('/ideas/search', async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (query.length < 2) {
    res.status(400).json({ error: 'Search query must be at least 2 characters.' });
    return;
  }

  try {
    const results = await searchLiveMealIdeas(query);
    res.json({ query, results, feed: getMealIdeasFeed() });
  } catch (err) {
    res.status(502).json({
      error: err instanceof Error ? err.message : 'Could not search online recipes.',
    });
  }
});

mealsRouter.post('/ideas/import-url', async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
  if (!url) {
    res.status(400).json({ error: 'Recipe URL is required.' });
    return;
  }

  try {
    const idea = await importMealIdeaFromUrl(url);
    res.status(201).json({ idea, feed: getMealIdeasFeed() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not import recipe from that URL.';
    const status = message.startsWith('Please enter a valid') ? 400 : 422;
    res.status(status).json({ error: message });
  }
});

mealsRouter.post('/ideas/:ideaId/add', (req, res) => {
  const ideaId = typeof req.params.ideaId === 'string' ? req.params.ideaId.trim() : '';
  const idea = findMealIdeaById(ideaId);
  if (!idea) {
    res.status(404).json({ error: 'Meal idea not found.' });
    return;
  }

  const normalizedIdeaName = normalizeIngredientName(idea.name);
  const existingRows = db.prepare('SELECT id, name FROM meals').all() as Array<{
    id: number;
    name: string;
  }>;
  const duplicate = existingRows.find(
    (row) => normalizeIngredientName(row.name) === normalizedIdeaName
  );
  if (duplicate) {
    res.status(409).json({ error: `"${idea.name}" is already in your meal library.` });
    return;
  }

  const safeImageUrl =
    idea.imageUrl &&
    (idea.imageUrl.startsWith('https://') || idea.imageUrl.startsWith('http://'))
      ? idea.imageUrl
      : '';

  const createTx = db.transaction(() => {
    const result = db
      .prepare(
        "INSERT INTO meals (name, notes, tags, image_url, updated_at) VALUES (?, ?, ?, ?, datetime('now'))"
      )
      .run(idea.name, idea.notes, JSON.stringify(idea.tags), safeImageUrl);
    const mealId = Number(result.lastInsertRowid);

    const insertIng = db.prepare(
      'INSERT INTO meal_ingredients (meal_id, name, normalized_name, quantity, unit, alternatives) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const ing of idea.ingredients) {
      const alternatives = sanitizeIngredientAlternatives(ing.alternatives, ing.name);
      insertIng.run(
        mealId,
        ing.name,
        normalizeIngredientName(ing.name),
        ing.quantity,
        ing.unit ?? '',
        JSON.stringify(alternatives)
      );
    }
    return mealId;
  });

  const mealId = createTx();
  const row = db
    .prepare('SELECT id, name, notes, tags, image_url, created_at, updated_at FROM meals WHERE id = ?')
    .get(mealId) as MealRow;

  res.status(201).json(hydrateMeals([row])[0]);
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
      'INSERT INTO meal_ingredients (meal_id, name, normalized_name, quantity, unit, alternatives) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const ing of ingredients) {
      insertIng.run(
        mealId,
        ing.name,
        normalizeIngredientName(ing.name),
        ing.quantity,
        ing.unit ?? '',
        JSON.stringify(ing.alternatives)
      );
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
      'INSERT INTO meal_ingredients (meal_id, name, normalized_name, quantity, unit, alternatives) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const ing of ingredients) {
      insertIng.run(
        id,
        ing.name,
        normalizeIngredientName(ing.name),
        ing.quantity,
        ing.unit ?? '',
        JSON.stringify(ing.alternatives)
      );
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
