import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Default on-disk location for the application database. */
export const DEFAULT_DB_FILE = './data/settings.db';

export type Db = Database.Database;

/**
 * Ordered list of schema migrations. Each entry brings the database from
 * version `index` to version `index + 1`. To evolve the schema, append a new
 * migration — never edit or reorder existing ones (they may already have run
 * against live databases). The current schema version is tracked by SQLite's
 * built-in `PRAGMA user_version`.
 */
const MIGRATIONS: ReadonlyArray<(db: Db) => void> = [
  // v0 -> v1: initial schema (settings key/value table + templates table).
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        section    TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
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
  },
];

/** The schema version the current code expects (== number of migrations). */
export const SCHEMA_VERSION = MIGRATIONS.length;

/**
 * Apply any migrations the database has not yet run, in a single transaction.
 * Idempotent: running against an up-to-date database is a no-op.
 */
export function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  if (current >= MIGRATIONS.length) return;

  const run = db.transaction(() => {
    for (let version = current; version < MIGRATIONS.length; version++) {
      MIGRATIONS[version](db);
      // user_version only accepts a literal, so interpolate the validated int.
      db.pragma(`user_version = ${version + 1}`);
    }
  });
  run();
}

/**
 * Open (and if necessary create) the SQLite database, applying schema
 * migrations before returning.
 *
 * The `settings` table is a simple key/value store — each row is a top-level
 * section ("printer", "label") whose value is a JSON blob — so settings stay
 * schema-flexible. WAL mode improves concurrent reads and `busy_timeout`
 * avoids spurious `SQLITE_BUSY` errors under concurrent writers.
 *
 * Pass ':memory:' as the path for an ephemeral database (used in tests).
 */
export function openDatabase(dbFile: string = DEFAULT_DB_FILE): Db {
  if (dbFile !== ':memory:') {
    const abs = resolve(dbFile);
    mkdirSync(dirname(abs), { recursive: true });
  }

  const db = new Database(dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  migrate(db);

  return db;
}
