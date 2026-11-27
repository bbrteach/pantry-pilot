import { Router } from 'express';
import { db } from '../db/database.js';

export const planRouter = Router();

export interface MealSideItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface MealCustomization {
  mealId: number;
  sides: MealSideItem[];
  swaps: Record<string, string[]>; // original normalized ingredient name -> selected replacement ingredient name(s)
}

export function normalizeSwapsRecord(rawSwaps: unknown): Record<string, string[]> {
  if (!rawSwaps || typeof rawSwaps !== 'object' || Array.isArray(rawSwaps)) {
    return {};
  }

  const normalized: Record<string, string[]> = {};
  for (const [origKey, rawVal] of Object.entries(rawSwaps as Record<string, unknown>)) {
    const cleanKey = origKey.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!cleanKey) continue;

    const candidates = Array.isArray(rawVal)
      ? rawVal
      : typeof rawVal === 'string'
      ? [rawVal]
      : [];

    const seen = new Set<string>();
    const cleanList: string[] = [];
    for (const item of candidates) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim().replace(/\s+/g, ' ');
      if (!trimmed) continue;
      const itemNorm = trimmed.toLowerCase();
      if (seen.has(itemNorm)) continue;
      seen.add(itemNorm);
      cleanList.push(trimmed);
    }

    if (cleanList.length === 0) continue;
    // A single selection identical to the original ingredient is a no-op swap
    if (cleanList.length === 1 && cleanList[0].toLowerCase() === cleanKey) continue;

    normalized[cleanKey] = cleanList;
  }

  return normalized;
}

export interface QuickSidePreset {
  name: string;
  quantity: number;
  unit: string;
  category: 'Vegetable' | 'Side';
}

const SIDE_PRESETS_SETTING_KEY = 'quick_side_presets';

export const DEFAULT_QUICK_SIDE_PRESETS: QuickSidePreset[] = [
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

function sanitizeSidePresets(raw: unknown): QuickSidePreset[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const clean: QuickSidePreset[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name.trim().slice(0, 60) : '';
    if (!name) continue;
    const key = name.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    const qty = Number(rec.quantity);
    clean.push({
      name,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      unit: typeof rec.unit === 'string' ? rec.unit.trim().slice(0, 24) : '',
      category: rec.category === 'Side' ? 'Side' : 'Vegetable',
    });
  }
  return clean;
}

function getStoredSidePresets(): { presets: QuickSidePreset[]; isCustom: boolean } {
  const row = db
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(SIDE_PRESETS_SETTING_KEY) as { value: string } | undefined;

  if (!row) {
    return { presets: DEFAULT_QUICK_SIDE_PRESETS, isCustom: false };
  }

  try {
    const parsed = JSON.parse(row.value) as unknown;
    return { presets: sanitizeSidePresets(parsed), isCustom: true };
  } catch {
    return { presets: DEFAULT_QUICK_SIDE_PRESETS, isCustom: false };
  }
}

function getAllCustomizations(): Record<number, MealCustomization> {
  const rows = db
    .prepare('SELECT meal_id, sides, swaps FROM meal_plan_customizations')
    .all() as Array<{ meal_id: number; sides: string; swaps: string }>;

  const result: Record<number, MealCustomization> = {};
  for (const row of rows) {
    let parsedSwaps: unknown = {};
    try {
      parsedSwaps = JSON.parse(row.swaps || '{}');
    } catch {
      parsedSwaps = {};
    }
    result[row.meal_id] = {
      mealId: row.meal_id,
      sides: JSON.parse(row.sides || '[]') as MealSideItem[],
      swaps: normalizeSwapsRecord(parsedSwaps),
    };
  }
  return result;
}

planRouter.get('/', (_req, res) => {
  const rows = db
    .prepare('SELECT meal_id FROM meal_plan_selections ORDER BY selected_at ASC')
    .all() as Array<{ meal_id: number }>;

  res.json({
    mealIds: rows.map((r) => r.meal_id),
    customizations: getAllCustomizations(),
    sidePresets: getStoredSidePresets().presets,
  });
});

planRouter.put('/', (req, res) => {
  const rawIds = Array.isArray(req.body?.mealIds) ? req.body.mealIds : null;
  if (!rawIds) {
    res.status(400).json({ error: 'mealIds array is required.' });
    return;
  }

  const uniqueIds: number[] = Array.from(
    new Set<number>(
      (rawIds as unknown[])
        .map((id) => Number(id))
        .filter((id): id is number => Number.isInteger(id) && id > 0)
    )
  );

  let validIds: number[] = [];
  if (uniqueIds.length > 0) {
    const placeholders = uniqueIds.map(() => '?').join(',');
    const found = db
      .prepare(`SELECT id FROM meals WHERE id IN (${placeholders})`)
      .all(...uniqueIds) as Array<{ id: number }>;
    const foundSet = new Set(found.map((r) => r.id));
    validIds = uniqueIds.filter((id) => foundSet.has(id));
  }

  const saveTx = db.transaction(() => {
    db.prepare('DELETE FROM meal_plan_selections').run();
    const insert = db.prepare('INSERT INTO meal_plan_selections (meal_id) VALUES (?)');
    for (const id of validIds) {
      insert.run(id);
    }
    if (validIds.length === 0) {
      db.prepare("DELETE FROM meal_schedule_slots WHERE entry_type = 'meal'").run();
      db.prepare('DELETE FROM meal_plan_customizations').run();
    } else {
      const placeholders = validIds.map(() => '?').join(',');
      db.prepare(
        `DELETE FROM meal_schedule_slots WHERE entry_type = 'meal' AND meal_id NOT IN (${placeholders})`
      ).run(...validIds);
      db.prepare(
        `DELETE FROM meal_plan_customizations WHERE meal_id NOT IN (${placeholders})`
      ).run(...validIds);
    }
  });

  saveTx();
  res.json({
    mealIds: validIds,
    customizations: getAllCustomizations(),
  });
});

planRouter.delete('/', (_req, res) => {
  const resetTx = db.transaction(() => {
    db.prepare('DELETE FROM meal_plan_selections').run();
    db.prepare('DELETE FROM meal_plan_customizations').run();
    db.prepare('DELETE FROM meal_schedule_slots').run();
  });
  resetTx();
  res.json({
    mealIds: [],
    customizations: {},
    slots: [],
  });
});

planRouter.get('/customizations', (_req, res) => {
  res.json({ customizations: getAllCustomizations() });
});

planRouter.put('/customizations/:mealId', (req, res) => {
  const mealId = Number(req.params.mealId);
  if (!Number.isInteger(mealId) || mealId <= 0) {
    res.status(400).json({ error: 'Invalid mealId.' });
    return;
  }

  const exists = db.prepare('SELECT id FROM meals WHERE id = ?').get(mealId);
  if (!exists) {
    res.status(404).json({ error: 'Meal not found.' });
    return;
  }

  const rawSides = Array.isArray(req.body?.sides) ? req.body.sides : [];
  const sides: MealSideItem[] = [];
  for (const item of rawSides) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!name) continue;
    const qty = Number(rec.quantity);
    sides.push({
      id: typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : `side-${Date.now()}-${sides.length}`,
      name,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      unit: typeof rec.unit === 'string' ? rec.unit.trim() : '',
    });
  }

  const swaps = normalizeSwapsRecord(req.body?.swaps);

  const saveTx = db.transaction(() => {
    // Ensure meal is selected in plan when customized
    db.prepare('INSERT OR IGNORE INTO meal_plan_selections (meal_id) VALUES (?)').run(mealId);

    if (sides.length === 0 && Object.keys(swaps).length === 0) {
      db.prepare('DELETE FROM meal_plan_customizations WHERE meal_id = ?').run(mealId);
    } else {
      db.prepare(
        `INSERT INTO meal_plan_customizations (meal_id, sides, swaps, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(meal_id) DO UPDATE SET
           sides = excluded.sides,
           swaps = excluded.swaps,
           updated_at = datetime('now')`
      ).run(mealId, JSON.stringify(sides), JSON.stringify(swaps));
    }
  });

  saveTx();
  res.json({
    customization: { mealId, sides, swaps },
    customizations: getAllCustomizations(),
  });
});

planRouter.delete('/customizations/:mealId', (req, res) => {
  const mealId = Number(req.params.mealId);
  if (!Number.isInteger(mealId) || mealId <= 0) {
    res.status(400).json({ error: 'Invalid mealId.' });
    return;
  }
  db.prepare('DELETE FROM meal_plan_customizations WHERE meal_id = ?').run(mealId);
  res.json({ customizations: getAllCustomizations() });
});

planRouter.get('/side-presets', (_req, res) => {
  res.json(getStoredSidePresets());
});

planRouter.put('/side-presets', (req, res) => {
  if (!Array.isArray(req.body?.presets)) {
    res.status(400).json({ error: 'presets array is required.' });
    return;
  }
  const clean = sanitizeSidePresets(req.body.presets);
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(SIDE_PRESETS_SETTING_KEY, JSON.stringify(clean));

  res.json({ presets: clean, isCustom: true });
});

planRouter.delete('/side-presets', (_req, res) => {
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(SIDE_PRESETS_SETTING_KEY);
  res.json({ presets: DEFAULT_QUICK_SIDE_PRESETS, isCustom: false });
});
