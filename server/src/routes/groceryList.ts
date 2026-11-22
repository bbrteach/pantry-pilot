import { Router } from 'express';
import { db } from '../db/database.js';
import {
  computeDefaultCartQuantity,
  consolidateIngredients,
  formatUnitBreakdown,
  normalizeIngredientName,
  normalizeUnit,
  roundQuantity,
  type ConsolidationInput,
  type UnitAmount,
} from '../services/consolidation.js';

export const groceryListRouter = Router();

interface GroceryRow {
  id: number;
  name: string;
  normalized_name: string;
  unit_breakdown: string;
  sources: string;
  is_checked: number;
  is_ad_hoc: number;
  cart_quantity: number;
  created_at: string;
  updated_at: string;
  mapped_upc: string | null;
  mapped_product_id: string | null;
  mapped_description: string | null;
  mapped_brand: string | null;
  mapped_size: string | null;
  mapped_image_url: string | null;
  mapped_last_price: number | null;
  mapped_promo_price: number | null;
}

function mapGroceryRow(row: GroceryRow) {
  const unitBreakdown = JSON.parse(row.unit_breakdown || '[]') as UnitAmount[];
  const sources = JSON.parse(row.sources || '[]') as string[];

  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    unitBreakdown,
    quantityDisplay: formatUnitBreakdown(unitBreakdown),
    sources,
    isChecked: Boolean(row.is_checked),
    isAdHoc: Boolean(row.is_ad_hoc),
    cartQuantity: row.cart_quantity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    productMapping: row.mapped_upc
      ? {
          normalizedName: row.normalized_name,
          upc: row.mapped_upc,
          productId: row.mapped_product_id ?? '',
          description: row.mapped_description ?? '',
          brand: row.mapped_brand ?? '',
          size: row.mapped_size ?? '',
          imageUrl: row.mapped_image_url ?? '',
          lastPrice: row.mapped_last_price,
          promoPrice: row.mapped_promo_price,
        }
      : null,
  };
}

function fetchGroceryList() {
  const rows = db
    .prepare(
      `SELECT
        g.id, g.name, g.normalized_name, g.unit_breakdown, g.sources,
        g.is_checked, g.is_ad_hoc, g.cart_quantity, g.created_at, g.updated_at,
        p.upc AS mapped_upc,
        p.product_id AS mapped_product_id,
        p.description AS mapped_description,
        p.brand AS mapped_brand,
        p.size AS mapped_size,
        p.image_url AS mapped_image_url,
        p.last_price AS mapped_last_price,
        p.promo_price AS mapped_promo_price
       FROM grocery_list_items g
       LEFT JOIN product_mappings p ON p.normalized_name = g.normalized_name
       ORDER BY g.is_checked ASC, g.name COLLATE NOCASE ASC`
    )
    .all() as GroceryRow[];

  return rows.map(mapGroceryRow);
}

groceryListRouter.get('/', (_req, res) => {
  res.json(fetchGroceryList());
});

groceryListRouter.post('/generate', (req, res) => {
  let mealIds: number[] = [];

  if (Array.isArray(req.body?.mealIds)) {
    mealIds = Array.from(
      new Set(
        req.body.mealIds
          .map((id: unknown) => Number(id))
          .filter((id: number) => Number.isInteger(id) && id > 0)
      )
    );
    const syncPlanTx = db.transaction(() => {
      db.prepare('DELETE FROM meal_plan_selections').run();
      if (mealIds.length > 0) {
        const placeholders = mealIds.map(() => '?').join(',');
        const valid = db
          .prepare(`SELECT id FROM meals WHERE id IN (${placeholders})`)
          .all(...mealIds) as Array<{ id: number }>;
        const insert = db.prepare('INSERT INTO meal_plan_selections (meal_id) VALUES (?)');
        mealIds = valid.map((r) => r.id);
        for (const id of mealIds) {
          insert.run(id);
        }
      }
    });
    syncPlanTx();
  } else {
    const selected = db
      .prepare('SELECT meal_id FROM meal_plan_selections')
      .all() as Array<{ meal_id: number }>;
    mealIds = selected.map((r) => r.meal_id);
  }

  const inputs: ConsolidationInput[] = [];

  if (mealIds.length > 0) {
    const placeholders = mealIds.map(() => '?').join(',');
    const scheduleCounts = db
      .prepare(
        `SELECT meal_id, COUNT(*) AS cnt
         FROM meal_schedule_slots
         WHERE entry_type = 'meal' AND meal_id IN (${placeholders})
         GROUP BY meal_id`
      )
      .all(...mealIds) as Array<{ meal_id: number; cnt: number }>;
    const countByMealId = new Map(scheduleCounts.map((r) => [r.meal_id, r.cnt]));

    const custRows = db
      .prepare(
        `SELECT meal_id, sides, swaps
         FROM meal_plan_customizations
         WHERE meal_id IN (${placeholders})`
      )
      .all(...mealIds) as Array<{ meal_id: number; sides: string; swaps: string }>;

    const customByMealId = new Map<
      number,
      {
        sides: Array<{ name: string; quantity: number; unit: string }>;
        swaps: Record<string, string>;
      }
    >();
    for (const c of custRows) {
      customByMealId.set(c.meal_id, {
        sides: JSON.parse(c.sides || '[]') as Array<{
          name: string;
          quantity: number;
          unit: string;
        }>,
        swaps: JSON.parse(c.swaps || '{}') as Record<string, string>,
      });
    }

    const mealNameRows = db
      .prepare(`SELECT id, name FROM meals WHERE id IN (${placeholders})`)
      .all(...mealIds) as Array<{ id: number; name: string }>;
    const mealNameById = new Map(mealNameRows.map((m) => [m.id, m.name]));

    const mealIngRows = db
      .prepare(
        `SELECT mi.meal_id, m.name AS meal_name, mi.name, mi.normalized_name, mi.quantity, mi.unit
         FROM meal_ingredients mi
         JOIN meals m ON m.id = mi.meal_id
         WHERE mi.meal_id IN (${placeholders})`
      )
      .all(...mealIds) as Array<{
      meal_id: number;
      meal_name: string;
      name: string;
      normalized_name: string;
      quantity: number;
      unit: string;
    }>;

    for (const row of mealIngRows) {
      const occurrences = Math.max(1, countByMealId.get(row.meal_id) ?? 1);
      const custom = customByMealId.get(row.meal_id);
      const swappedName = custom?.swaps?.[row.normalized_name]?.trim();
      const effectiveName = swappedName || row.name;

      for (let i = 0; i < occurrences; i++) {
        inputs.push({
          name: effectiveName,
          quantity: row.quantity,
          unit: row.unit,
          source: occurrences > 1 ? `${row.meal_name} (×${occurrences})` : row.meal_name,
        });
      }
    }

    // Append added vegetables & sides for each customized meal
    for (const [mealId, custom] of customByMealId.entries()) {
      if (!custom.sides.length) continue;
      const mealName = mealNameById.get(mealId) || 'Meal';
      const occurrences = Math.max(1, countByMealId.get(mealId) ?? 1);
      for (const side of custom.sides) {
        if (!side.name.trim()) continue;
        for (let i = 0; i < occurrences; i++) {
          inputs.push({
            name: side.name,
            quantity: side.quantity > 0 ? side.quantity : 1,
            unit: side.unit || '',
            source:
              occurrences > 1
                ? `${mealName} side (×${occurrences})`
                : `${mealName} (side)`,
          });
        }
      }
    }
  }

  const autoStaples = db
    .prepare('SELECT name, quantity, unit FROM staples WHERE auto_include = 1')
    .all() as Array<{ name: string; quantity: number; unit: string }>;

  for (const staple of autoStaples) {
    inputs.push({
      name: staple.name,
      quantity: staple.quantity,
      unit: staple.unit,
      source: 'Staple',
    });
  }

  const consolidated = consolidateIngredients(inputs);

  const replaceTx = db.transaction(() => {
    db.prepare('DELETE FROM grocery_list_items').run();
    const insert = db.prepare(
      `INSERT INTO grocery_list_items
        (name, normalized_name, unit_breakdown, sources, is_checked, is_ad_hoc, cart_quantity)
       VALUES (?, ?, ?, ?, 0, 0, ?)`
    );
    for (const item of consolidated) {
      insert.run(
        item.name,
        item.normalizedName,
        JSON.stringify(item.unitBreakdown),
        JSON.stringify(item.sources),
        item.cartQuantity
      );
    }
  });

  replaceTx();

  res.json({
    summary: {
      mealCount: mealIds.length,
      stapleCount: autoStaples.length,
      itemCount: consolidated.length,
    },
    items: fetchGroceryList(),
  });
});

groceryListRouter.post('/items', (req, res) => {
  const body = req.body ?? {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'Item name is required.' });
    return;
  }

  const parsedQty = Number(body.quantity);
  const quantity = Number.isFinite(parsedQty) && parsedQty > 0 ? roundQuantity(parsedQty) : 1;
  const unit = normalizeUnit(typeof body.unit === 'string' ? body.unit : '');
  const unitBreakdown: UnitAmount[] = [{ quantity, unit }];
  const normalizedName = normalizeIngredientName(name);
  const cartQuantity = computeDefaultCartQuantity(unitBreakdown);

  const result = db
    .prepare(
      `INSERT INTO grocery_list_items
        (name, normalized_name, unit_breakdown, sources, is_checked, is_ad_hoc, cart_quantity)
       VALUES (?, ?, ?, ?, 0, 1, ?)`
    )
    .run(name, normalizedName, JSON.stringify(unitBreakdown), JSON.stringify(['Ad-hoc']), cartQuantity);

  const id = Number(result.lastInsertRowid);
  const created = fetchGroceryList().find((item) => item.id === id);
  res.status(201).json(created);
});

groceryListRouter.patch('/items/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid item ID.' });
    return;
  }

  const existing = db
    .prepare(
      'SELECT id, name, normalized_name, unit_breakdown, sources, is_checked, is_ad_hoc, cart_quantity FROM grocery_list_items WHERE id = ?'
    )
    .get(id) as
    | {
        id: number;
        name: string;
        normalized_name: string;
        unit_breakdown: string;
        sources: string;
        is_checked: number;
        is_ad_hoc: number;
        cart_quantity: number;
      }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Grocery list item not found.' });
    return;
  }

  const body = req.body ?? {};
  let name = existing.name;
  let normalizedName = existing.normalized_name;
  if (typeof body.name === 'string' && body.name.trim()) {
    name = body.name.trim();
    normalizedName = normalizeIngredientName(name);
  }

  let unitBreakdown = JSON.parse(existing.unit_breakdown || '[]') as UnitAmount[];
  let cartQuantity = existing.cart_quantity;

  if (Array.isArray(body.unitBreakdown) && body.unitBreakdown.length > 0) {
    unitBreakdown = body.unitBreakdown
      .map((entry: unknown) => {
        const rec = entry as Record<string, unknown>;
        const qty = Number(rec.quantity);
        return {
          quantity: Number.isFinite(qty) && qty > 0 ? roundQuantity(qty) : 1,
          unit: normalizeUnit(typeof rec.unit === 'string' ? rec.unit : ''),
        };
      });
    cartQuantity = computeDefaultCartQuantity(unitBreakdown);
  } else if (typeof body.delta === 'number' && Number.isFinite(body.delta) && body.delta !== 0) {
    const unitIndex =
      typeof body.unitIndex === 'number' &&
      body.unitIndex >= 0 &&
      body.unitIndex < unitBreakdown.length
        ? body.unitIndex
        : 0;

    if (unitBreakdown.length === 0) {
      unitBreakdown = [{ quantity: 1, unit: '' }];
    }

    const current = unitBreakdown[unitIndex].quantity;
    const step = current < 1 || !Number.isInteger(current) ? 0.5 : 1;
    const nextQty = roundQuantity(
      Math.max(0.25, current + (body.delta > 0 ? step : -step))
    );
    unitBreakdown = unitBreakdown.map((entry, idx) =>
      idx === unitIndex ? { ...entry, quantity: nextQty } : entry
    );
    cartQuantity = computeDefaultCartQuantity(unitBreakdown);
  }

  if (typeof body.cartQuantity === 'number' && Number.isInteger(body.cartQuantity) && body.cartQuantity >= 1) {
    cartQuantity = body.cartQuantity;
  }

  const isChecked =
    body.isChecked !== undefined ? (body.isChecked ? 1 : 0) : existing.is_checked;

  db.prepare(
    `UPDATE grocery_list_items
     SET name = ?, normalized_name = ?, unit_breakdown = ?, is_checked = ?, cart_quantity = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(name, normalizedName, JSON.stringify(unitBreakdown), isChecked, cartQuantity, id);

  const updated = fetchGroceryList().find((item) => item.id === id);
  res.json(updated);
});

groceryListRouter.delete('/checked', (_req, res) => {
  const result = db.prepare('DELETE FROM grocery_list_items WHERE is_checked = 1').run();
  res.json({ deletedCount: result.changes });
});

groceryListRouter.delete('/items/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid item ID.' });
    return;
  }

  const result = db.prepare('DELETE FROM grocery_list_items WHERE id = ?').run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Grocery list item not found.' });
    return;
  }

  res.json({ deleted: true, id });
});
