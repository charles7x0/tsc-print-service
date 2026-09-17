import type { Db } from './database.js';
import {
  DEFAULT_SETTINGS,
  settingsSchema,
  type Settings,
  type SettingsUpdate,
} from './settings.js';

interface SettingsRow {
  section: string;
  value: string;
}

/**
 * Reads and writes application settings backed by the SQLite `settings` table.
 * Each top-level section ("printer", "label") is stored as a JSON blob.
 *
 * The constructor is pure (prepares statements only). Use the static `create`
 * factory to construct and seed defaults in one step at startup.
 */
export class SettingsRepository {
  private readonly selectStmt;
  private readonly upsertStmt;

  constructor(private readonly db: Db) {
    this.selectStmt = db.prepare<[string], SettingsRow>(
      'SELECT section, value FROM settings WHERE section = ?',
    );
    this.upsertStmt = db.prepare<[string, string]>(
      `INSERT INTO settings (section, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(section) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    );
  }

  /**
   * Construct the repository and seed default sections in one step. Prefer this
   * over `new SettingsRepository(db)` at application startup; the bare
   * constructor performs no writes, which keeps it pure and predictable.
   */
  static create(db: Db): SettingsRepository {
    const repo = new SettingsRepository(db);
    repo.seedDefaults();
    return repo;
  }

  /** Insert default sections if they are not already present. */
  seedDefaults(): void {
    const seed = this.db.transaction(() => {
      for (const section of ['printer', 'label'] as const) {
        const existing = this.selectStmt.get(section);
        if (!existing) {
          this.upsertStmt.run(section, JSON.stringify(DEFAULT_SETTINGS[section]));
        }
      }
    });
    seed();
  }

  private readSection(section: keyof Settings): unknown {
    const row = this.selectStmt.get(section);
    if (!row) {
      // Should not happen after seeding, but fall back to defaults defensively.
      return DEFAULT_SETTINGS[section];
    }
    // Parsed as unknown; settingsSchema.parse in getSettings is the sole gate.
    return JSON.parse(row.value);
  }

  /** Return the full, validated settings snapshot. */
  getSettings(): Settings {
    const raw = {
      printer: this.readSection('printer'),
      label: this.readSection('label'),
    };
    // Validate on read so a hand-edited/corrupt DB surfaces a clear error.
    return settingsSchema.parse(raw);
  }

  /**
   * Apply a partial update (merging into existing values) and return the new
   * validated settings. The whole write is transactional.
   */
  updateSettings(update: SettingsUpdate): Settings {
    const current = this.getSettings();

    const next: Settings = {
      printer: { ...current.printer, ...(update.printer ?? {}) },
      label: { ...current.label, ...(update.label ?? {}) },
    };

    // Validate the merged result before persisting.
    const validated = settingsSchema.parse(next);

    const write = this.db.transaction(() => {
      this.upsertStmt.run('printer', JSON.stringify(validated.printer));
      this.upsertStmt.run('label', JSON.stringify(validated.label));
    });
    write();

    return validated;
  }
}
