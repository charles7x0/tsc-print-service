import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { openDatabase, type Db } from '../src/db/database.js';
import { SettingsRepository } from '../src/db/settingsRepository.js';
import { DEFAULT_SETTINGS } from '../src/db/settings.js';

describe('SettingsRepository', () => {
  let db: Db;
  let repo: SettingsRepository;

  beforeEach(() => {
    db = openDatabase(':memory:');
    repo = new SettingsRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('seeds default settings into a fresh database', () => {
    expect(repo.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('applies a partial printer update and persists it', () => {
    const updated = repo.updateSettings({ printer: { ip: '10.1.2.3', dryRun: false } });
    expect(updated.printer.ip).toBe('10.1.2.3');
    expect(updated.printer.dryRun).toBe(false);
    // Untouched fields keep their previous values.
    expect(updated.printer.port).toBe(DEFAULT_SETTINGS.printer.port);

    // A new repository over the same DB reads the persisted value.
    const repo2 = new SettingsRepository(db);
    expect(repo2.getSettings().printer.ip).toBe('10.1.2.3');
  });

  it('applies a partial label update', () => {
    const updated = repo.updateSettings({ label: { widthMm: 100, heightMm: 50 } });
    expect(updated.label.widthMm).toBe(100);
    expect(updated.label.heightMm).toBe(50);
    expect(updated.label.dpmm).toBe(DEFAULT_SETTINGS.label.dpmm);
  });

  it('rejects an invalid label direction', () => {
    // 5 is not a valid direction (only 0 or 1).
    expect(() =>
      repo.updateSettings({ label: { direction: 5 as unknown as 0 } }),
    ).toThrow();
  });

  it('does not partially write when validation fails', () => {
    const before = repo.getSettings();
    try {
      repo.updateSettings({ printer: { port: -1 } });
    } catch {
      /* expected */
    }
    expect(repo.getSettings()).toEqual(before);
  });
});
