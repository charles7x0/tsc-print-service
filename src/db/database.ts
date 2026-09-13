import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Default on-disk location for the settings database. */
export const DEFAULT_DB_FILE = './data/settings.db';

/**
 * Open (and if necessary create) the SQLite database used for settings.
 *
 * Uses a simple key/value table so settings are schema-flexible: each row is a
 * top-level section ("printer", "label") whose value is a JSON blob. WAL mode
 * is enabled for better concurrent read behaviour.
 *
 * Pass ':memory:' as the path for an ephemeral database (used in tests).
 */
export function openDatabase(dbFile: string = DEFAULT_DB_FILE): Database.Database {
  if (dbFile !== ':memory:') {
    const abs = resolve(dbFile);
    mkdirSync(dirname(abs), { recursive: true });
  }

  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      section TEXT PRIMARY KEY,
      value   TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS templates (
      name        TEXT PRIMARY KEY,
      description TEXT NOT NULL DEFAULT '',
      source      TEXT NOT NULL,
      variables   TEXT NOT NULL DEFAULT '[]',
      geometry    TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

export type Db = Database.Database;
