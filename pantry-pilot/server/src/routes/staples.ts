import { Router } from 'express';
import { db } from '../db/database.js';
import { normalizeIngredientName } from '../services/consolidation.js';

export const staplesRouter = Router();

interface StapleRow {
  id: number;
  name: string;
  normalized_name: string;
  quantity: number;
  unit: string;
  auto_include: number;
  created_at: string;
  updated_at: string;
}

function mapStaple(row: StapleRow) {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    autoInclude: Boolean(row.auto_include),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

staplesRouter.get('/', (_req, res) => {
  const rows = db
    .prepare(
      'SELECT id, name, normalized_name, quantity, unit, auto_include, created_at, updated_at FROM staples ORDER BY auto_include DESC, name COLLATE NOCASE ASC'
    )
    .all() as StapleRow[];

  res.json(rows.map(mapStaple));
});

staplesRouter.post('/', (req, res) => {
  const body = req.body ?? {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'Staple name is required.' });
    return;
  }

  const parsedQty = Number(body.quantity);
  const quantity = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;
  const unit = typeof body.unit === 'string' ? body.unit.trim() : '';
  const autoInclude = body.autoInclude === undefined ? true : Boolean(body.autoInclude);

  const result = db
    .prepare(
      "INSERT INTO staples (name, normalized_name, quantity, unit, auto_include, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
    )
    .run(name, normalizeIngredientName(name), quantity, unit, autoInclude ? 1 : 0);

  const row = db
    .prepare('SELECT id, name, normalized_name, quantity, unit, auto_include, created_at, updated_at FROM staples WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as StapleRow;

  res.status(201).json(mapStaple(row));
});

staplesRouter.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid staple ID.' });
    return;
  }

  const existing = db
    .prepare('SELECT id, name, normalized_name, quantity, unit, auto_include, created_at, updated_at FROM staples WHERE id = ?')
    .get(id) as StapleRow | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Staple not found.' });
    return;
  }

  const body = req.body ?? {};
  const name = typeof body.name === 'string' ? body.name.trim() : existing.name;
  if (!name) {
    res.status(400).json({ error: 'Staple name cannot be empty.' });
    return;
  }

  const parsedQty = body.quantity !== undefined ? Number(body.quantity) : existing.quantity;
  const quantity = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : existing.quantity;
  const unit = typeof body.unit === 'string' ? body.unit.trim() : existing.unit;
  const autoInclude =
    body.autoInclude !== undefined ? (body.autoInclude ? 1 : 0) : existing.auto_include;

  db.prepare(
    "UPDATE staples SET name = ?, normalized_name = ?, quantity = ?, unit = ?, auto_include = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(name, normalizeIngredientName(name), quantity, unit, autoInclude, id);

  const updated = db
    .prepare('SELECT id, name, normalized_name, quantity, unit, auto_include, created_at, updated_at FROM staples WHERE id = ?')
    .get(id) as StapleRow;

  res.json(mapStaple(updated));
});

staplesRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid staple ID.' });
    return;
  }

  const result = db.prepare('DELETE FROM staples WHERE id = ?').run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Staple not found.' });
    return;
  }

  res.json({ deleted: true, id });
});
