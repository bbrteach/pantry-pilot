import { Router } from 'express';
import { db } from '../db/database.js';

export const scheduleRouter = Router();

export type ScheduleEntryType = 'meal' | 'myod' | 'restaurant';

interface ScheduleRow {
  week_number: 1 | 2;
  day_of_week: number;
  entry_type: ScheduleEntryType;
  meal_id: number | null;
  updated_at: string;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getAllSlots() {
  const rows = db
    .prepare(
      `SELECT week_number, day_of_week, entry_type, meal_id, updated_at
       FROM meal_schedule_slots
       ORDER BY week_number ASC, day_of_week ASC`
    )
    .all() as ScheduleRow[];

  return rows.map((r) => ({
    weekNumber: r.week_number,
    dayOfWeek: r.day_of_week,
    entryType: r.entry_type,
    mealId: r.meal_id,
    updatedAt: r.updated_at,
  }));
}

function getSelectedMealIds(): number[] {
  const rows = db
    .prepare('SELECT meal_id FROM meal_plan_selections ORDER BY selected_at ASC')
    .all() as Array<{ meal_id: number }>;
  return rows.map((r) => r.meal_id);
}

scheduleRouter.get('/', (_req, res) => {
  res.json({ slots: getAllSlots() });
});

/**
 * Smart day button handler from Plan cards (Su, M, T, W, Th, F, Sa):
 * - If this meal is already assigned to that weekday (Week 1 or Week 2), toggles it off.
 * - Otherwise places it in Week 1 if empty, or Week 2 if Week 1 is already taken.
 * - Also auto-selects the meal in meal_plan_selections when placed.
 */
scheduleRouter.post('/assign-meal-day', (req, res) => {
  const mealId = Number(req.body?.mealId);
  const dayOfWeek = Number(req.body?.dayOfWeek);

  if (!Number.isInteger(mealId) || mealId <= 0) {
    res.status(400).json({ error: 'Valid mealId is required.' });
    return;
  }
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    res.status(400).json({ error: 'dayOfWeek must be an integer from 0 (Su) to 6 (Sa).' });
    return;
  }

  const meal = db.prepare('SELECT id, name FROM meals WHERE id = ?').get(mealId) as
    | { id: number; name: string }
    | undefined;
  if (!meal) {
    res.status(404).json({ error: 'Meal not found.' });
    return;
  }

  const existingForDay = db
    .prepare(
      `SELECT week_number, day_of_week, entry_type, meal_id
       FROM meal_schedule_slots
       WHERE day_of_week = ?
       ORDER BY week_number ASC`
    )
    .all(dayOfWeek) as Array<{
    week_number: 1 | 2;
    day_of_week: number;
    entry_type: ScheduleEntryType;
    meal_id: number | null;
  }>;

  // If this meal is already on this weekday (check Week 2 first then Week 1 so removing feels natural), toggle it off
  const sameMealSlot =
    existingForDay.find((s) => s.entry_type === 'meal' && s.meal_id === mealId && s.week_number === 2) ||
    existingForDay.find((s) => s.entry_type === 'meal' && s.meal_id === mealId && s.week_number === 1);

  if (sameMealSlot) {
    db.prepare('DELETE FROM meal_schedule_slots WHERE week_number = ? AND day_of_week = ?').run(
      sameMealSlot.week_number,
      dayOfWeek
    );
    res.json({
      action: 'removed',
      weekNumber: sameMealSlot.week_number,
      dayOfWeek,
      message: `Removed ${meal.name} from Week ${sameMealSlot.week_number} ${DAY_NAMES[dayOfWeek]}`,
      slots: getAllSlots(),
      mealIds: getSelectedMealIds(),
    });
    return;
  }

  const week1Taken = existingForDay.some((s) => s.week_number === 1);
  const week2Taken = existingForDay.some((s) => s.week_number === 2);

  let targetWeek: 1 | 2 | null = null;
  if (!week1Taken) {
    targetWeek = 1;
  } else if (!week2Taken) {
    targetWeek = 2;
  }

  if (targetWeek === null) {
    res.status(409).json({
      action: 'full',
      error: `Both Week 1 and Week 2 ${DAY_NAMES[dayOfWeek]}s are already scheduled. Clear one on the Schedule tab first.`,
      slots: getAllSlots(),
      mealIds: getSelectedMealIds(),
    });
    return;
  }

  const assignTx = db.transaction(() => {
    db.prepare(
      `INSERT INTO meal_schedule_slots (week_number, day_of_week, entry_type, meal_id, updated_at)
       VALUES (?, ?, 'meal', ?, datetime('now'))`
    ).run(targetWeek, dayOfWeek, mealId);

    db.prepare(
      `INSERT OR IGNORE INTO meal_plan_selections (meal_id) VALUES (?)`
    ).run(mealId);
  });

  assignTx();

  res.json({
    action: 'assigned',
    weekNumber: targetWeek,
    dayOfWeek,
    message: `Scheduled ${meal.name} for Week ${targetWeek} ${DAY_NAMES[dayOfWeek]}`,
    slots: getAllSlots(),
    mealIds: getSelectedMealIds(),
  });
});

/**
 * Explicitly set a schedule slot to a meal, 'myod', or 'restaurant'
 */
scheduleRouter.put('/slot', (req, res) => {
  const weekNumber = Number(req.body?.weekNumber);
  const dayOfWeek = Number(req.body?.dayOfWeek);
  const entryType = typeof req.body?.entryType === 'string' ? req.body.entryType.trim().toLowerCase() : '';
  const mealId = req.body?.mealId !== undefined && req.body?.mealId !== null ? Number(req.body.mealId) : null;

  if (weekNumber !== 1 && weekNumber !== 2) {
    res.status(400).json({ error: 'weekNumber must be 1 or 2.' });
    return;
  }
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    res.status(400).json({ error: 'dayOfWeek must be 0..6.' });
    return;
  }
  if (entryType !== 'meal' && entryType !== 'myod' && entryType !== 'restaurant') {
    res.status(400).json({ error: 'entryType must be meal, myod, or restaurant.' });
    return;
  }

  if (entryType === 'meal') {
    if (!mealId || !Number.isInteger(mealId) || mealId <= 0) {
      res.status(400).json({ error: 'mealId is required when entryType is meal.' });
      return;
    }
    const exists = db.prepare('SELECT id FROM meals WHERE id = ?').get(mealId);
    if (!exists) {
      res.status(404).json({ error: 'Meal not found.' });
      return;
    }
  }

  const upsertTx = db.transaction(() => {
    db.prepare(
      `INSERT INTO meal_schedule_slots (week_number, day_of_week, entry_type, meal_id, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(week_number, day_of_week) DO UPDATE SET
         entry_type = excluded.entry_type,
         meal_id = excluded.meal_id,
         updated_at = datetime('now')`
    ).run(weekNumber, dayOfWeek, entryType, entryType === 'meal' ? mealId : null);

    if (entryType === 'meal' && mealId) {
      db.prepare('INSERT OR IGNORE INTO meal_plan_selections (meal_id) VALUES (?)').run(mealId);
    }
  });

  upsertTx();

  res.json({
    slots: getAllSlots(),
    mealIds: getSelectedMealIds(),
  });
});

scheduleRouter.delete('/slot/:weekNumber/:dayOfWeek', (req, res) => {
  const weekNumber = Number(req.params.weekNumber);
  const dayOfWeek = Number(req.params.dayOfWeek);

  if ((weekNumber !== 1 && weekNumber !== 2) || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    res.status(400).json({ error: 'Invalid weekNumber or dayOfWeek.' });
    return;
  }

  db.prepare('DELETE FROM meal_schedule_slots WHERE week_number = ? AND day_of_week = ?').run(
    weekNumber,
    dayOfWeek
  );

  res.json({
    slots: getAllSlots(),
    mealIds: getSelectedMealIds(),
  });
});

scheduleRouter.delete('/', (_req, res) => {
  db.prepare('DELETE FROM meal_schedule_slots').run();
  res.json({
    slots: [],
    mealIds: getSelectedMealIds(),
  });
});
