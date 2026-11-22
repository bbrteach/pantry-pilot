import { Router } from 'express';
import { db } from '../db/database.js';

export const planRouter = Router();

planRouter.get('/', (_req, res) => {
  const rows = db
    .prepare('SELECT meal_id FROM meal_plan_selections ORDER BY selected_at ASC')
    .all() as Array<{ meal_id: number }>;

  res.json({ mealIds: rows.map((r) => r.meal_id) });
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
    } else {
      const placeholders = validIds.map(() => '?').join(',');
      db.prepare(
        `DELETE FROM meal_schedule_slots WHERE entry_type = 'meal' AND meal_id NOT IN (${placeholders})`
      ).run(...validIds);
    }
  });

  saveTx();
  res.json({ mealIds: validIds });
});
