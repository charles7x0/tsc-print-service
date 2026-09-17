import { describe, expect, it } from 'vitest';
import { openDatabase, migrate, SCHEMA_VERSION, type Db } from '../src/db/database.js';

/** Read the current schema version from PRAGMA user_version. */
function userVersion(db: Db): number {
  return db.pragma('user_version', { simple: true }) as number;
}

describe('database migrations', () => {
  it('stamps a fresh database at the current schema version', () => {
    const db = openDatabase(':memory:');
    expect(userVersion(db)).toBe(SCHEMA_VERSION);
    db.close();
  });

  it('creates the settings and templates tables', () => {
    const db = openDatabase(':memory:');
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain('settings');
    expect(names).toContain('templates');
    db.close();
  });

  it('is idempotent — re-running migrate does not change the version', () => {
    const db = openDatabase(':memory:');
    const before = userVersion(db);
    migrate(db);
    migrate(db);
    expect(userVersion(db)).toBe(before);
    db.close();
  });

  it('enables the busy_timeout pragma', () => {
    const db = openDatabase(':memory:');
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
    db.close();
  });
});
