import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';

const dbDir = path.dirname(config.databasePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      image_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meal_ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      alternatives TEXT NOT NULL DEFAULT '[]',
      FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_meal_ingredients_meal_id ON meal_ingredients(meal_id);

    CREATE TABLE IF NOT EXISTS staples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      auto_include INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meal_plan_selections (
      meal_id INTEGER PRIMARY KEY,
      selected_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS grocery_list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      unit_breakdown TEXT NOT NULL,
      sources TEXT NOT NULL DEFAULT '[]',
      is_checked INTEGER NOT NULL DEFAULT 0,
      is_ad_hoc INTEGER NOT NULL DEFAULT 0,
      cart_quantity INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS kroger_tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      token_type TEXT NOT NULL,
      scope TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_mappings (
      normalized_name TEXT PRIMARY KEY,
      upc TEXT NOT NULL,
      product_id TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT '',
      size TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      last_price REAL,
      promo_price REAL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meal_schedule_slots (
      week_number INTEGER NOT NULL CHECK (week_number IN (1, 2)),
      day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      entry_type TEXT NOT NULL CHECK (entry_type IN ('meal', 'myod', 'restaurant')),
      meal_id INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (week_number, day_of_week),
      FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS kroger_deals_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id TEXT NOT NULL,
      search_term TEXT NOT NULL,
      upc TEXT NOT NULL,
      product_id TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT '',
      size TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      regular_price REAL NOT NULL,
      promo_price REAL NOT NULL,
      savings_amount REAL NOT NULL,
      savings_percent INTEGER NOT NULL,
      stock_level TEXT NOT NULL DEFAULT 'UNKNOWN',
      scanned_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_kroger_deals_location ON kroger_deals_cache(location_id);

    CREATE TABLE IF NOT EXISTS kroger_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      token_type TEXT NOT NULL DEFAULT 'bearer',
      scope TEXT NOT NULL DEFAULT 'product.compact cart.basic:write',
      expires_at INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meal_plan_customizations (
      meal_id INTEGER PRIMARY KEY,
      sides TEXT NOT NULL DEFAULT '[]',
      swaps TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
    );
  `);

  const mealCols = db.prepare('PRAGMA table_info(meals)').all() as Array<{ name: string }>;
  if (!mealCols.some((c) => c.name === 'image_url')) {
    db.exec("ALTER TABLE meals ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
  }

  const ingredientCols = db
    .prepare('PRAGMA table_info(meal_ingredients)')
    .all() as Array<{ name: string }>;
  if (!ingredientCols.some((c) => c.name === 'alternatives')) {
    db.exec("ALTER TABLE meal_ingredients ADD COLUMN alternatives TEXT NOT NULL DEFAULT '[]'");
  }

  const stapleCols = db.prepare('PRAGMA table_info(staples)').all() as Array<{ name: string }>;
  if (!stapleCols.some((c) => c.name === 'category')) {
    db.exec("ALTER TABLE staples ADD COLUMN category TEXT NOT NULL DEFAULT ''");
  }

  // One-time safe migration from legacy single-account kroger_tokens to kroger_accounts
  const acctCount = db.prepare('SELECT COUNT(*) as count FROM kroger_accounts').get() as { count: number };
  if (acctCount.count === 0) {
    const legacy = db
      .prepare('SELECT access_token, refresh_token, token_type, scope, expires_at FROM kroger_tokens WHERE id = 1')
      .get() as
      | {
          access_token: string;
          refresh_token: string;
          token_type: string;
          scope: string;
          expires_at: number;
        }
      | undefined;

    if (legacy && legacy.refresh_token) {
      db.prepare(
        `INSERT INTO kroger_accounts (label, access_token, refresh_token, token_type, scope, expires_at, is_active)
         VALUES ('Primary Kroger', ?, ?, ?, ?, ?, 1)`
      ).run(
        legacy.access_token,
        legacy.refresh_token,
        legacy.token_type || 'bearer',
        legacy.scope || 'product.compact cart.basic:write',
        legacy.expires_at
      );
    }
  }
}
