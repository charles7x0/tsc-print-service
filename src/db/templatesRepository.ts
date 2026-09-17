import type { Db } from './database.js';
import { SEED_TEMPLATES } from './templateSeeds.js';
import {
  createTemplateSchema,
  updateTemplateSchema,
  templateGeometrySchema,
  templateVariableSchema,
  validateStringTemplate,
  StringTemplateValidationError,
  type CreateTemplateInput,
  type StringTemplate,
  type UpdateTemplateInput,
} from '../templates/string-template.js';
import { z } from 'zod';

interface TemplateRow {
  name: string;
  description: string;
  source: string;
  variables: string;
  geometry: string;
  updated_at: string;
}

/** Thrown when a requested template name does not exist. */
export class TemplateNotFoundError extends Error {
  constructor(public readonly templateName: string) {
    super(`Template not found: "${templateName}"`);
    this.name = 'TemplateNotFoundError';
  }
}

/** Thrown when creating a template whose name already exists. */
export class TemplateExistsError extends Error {
  constructor(public readonly templateName: string) {
    super(`Template already exists: "${templateName}"`);
    this.name = 'TemplateExistsError';
  }
}

const variablesArraySchema = z.array(templateVariableSchema);

interface CountRow {
  n: number;
}

/**
 * Reads and writes user-authored TSPL string templates backed by the SQLite
 * `templates` table. Mirrors SettingsRepository: prepared statements and
 * transactional writes.
 *
 * The constructor is pure (prepares statements only). Use the static `create`
 * factory to construct and seed built-in templates in one step at startup.
 *
 * Every write is validated (zod schema + structural TSPL rules +
 * placeholder/variable consistency) so a broken template can never be
 * persisted.
 */
export class TemplatesRepository {
  private readonly selectAllStmt;
  private readonly selectOneStmt;
  private readonly insertStmt;
  private readonly updateStmt;
  private readonly deleteStmt;
  private readonly countStmt;

  constructor(private readonly db: Db) {
    this.selectAllStmt = db.prepare<[], TemplateRow>(
      'SELECT name, description, source, variables, geometry, updated_at FROM templates ORDER BY name',
    );
    this.selectOneStmt = db.prepare<[string], TemplateRow>(
      'SELECT name, description, source, variables, geometry, updated_at FROM templates WHERE name = ?',
    );
    this.insertStmt = db.prepare<[string, string, string, string, string]>(
      `INSERT INTO templates (name, description, source, variables, geometry, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    );
    this.updateStmt = db.prepare<[string, string, string, string, string]>(
      `UPDATE templates
       SET description = ?, source = ?, variables = ?, geometry = ?, updated_at = datetime('now')
       WHERE name = ?`,
    );
    this.deleteStmt = db.prepare<[string]>('DELETE FROM templates WHERE name = ?');
    this.countStmt = db.prepare<[string], CountRow>(
      'SELECT COUNT(*) AS n FROM templates WHERE name = ?',
    );
  }

  /**
   * Construct the repository and seed built-in templates in one step. Prefer
   * this over `new TemplatesRepository(db)` at application startup; the bare
   * constructor performs no writes, which keeps it pure and predictable.
   */
  static create(db: Db): TemplatesRepository {
    const repo = new TemplatesRepository(db);
    repo.seedDefaults();
    return repo;
  }

  /** Insert built-in templates that are not already present. */
  seedDefaults(): void {
    const seed = this.db.transaction(() => {
      for (const tpl of SEED_TEMPLATES) {
        if (!this.exists(tpl.name)) {
          const parsed = createTemplateSchema.parse(tpl);
          this.insertStmt.run(
            parsed.name,
            parsed.description,
            parsed.source,
            JSON.stringify(parsed.variables),
            JSON.stringify(parsed.geometry),
          );
        }
      }
    });
    seed();
  }

  private rowToTemplate(row: TemplateRow): StringTemplate {
    return {
      name: row.name,
      description: row.description,
      source: row.source,
      variables: variablesArraySchema.parse(JSON.parse(row.variables)),
      geometry: templateGeometrySchema.parse(JSON.parse(row.geometry)),
      updatedAt: row.updated_at,
    };
  }

  /** Internal existence check shared by has(), create(), update(), seeding. */
  private exists(name: string): boolean {
    const row = this.countStmt.get(name);
    return row !== undefined && row.n > 0;
  }

  /** List all templates (ordered by name). */
  list(): StringTemplate[] {
    return this.selectAllStmt.all().map((r) => this.rowToTemplate(r));
  }

  /** Return true if a template with the given name exists. */
  has(name: string): boolean {
    return this.exists(name);
  }

  /** Get a template by name or throw TemplateNotFoundError. */
  get(name: string): StringTemplate {
    const row = this.selectOneStmt.get(name);
    if (!row) throw new TemplateNotFoundError(name);
    return this.rowToTemplate(row);
  }

  /**
   * Create a new template. Throws TemplateExistsError if the name is taken and
   * StringTemplateValidationError if the TSPL/manifest is invalid.
   */
  create(input: CreateTemplateInput): StringTemplate {
    // Defense in depth: parse with the schema here too, not only at the route
    // layer, so the repository stays safe for any caller.
    const parsed = createTemplateSchema.parse(input);

    if (this.exists(parsed.name)) throw new TemplateExistsError(parsed.name);

    const issues = validateStringTemplate(parsed.source, parsed.variables);
    if (issues.length > 0) throw new StringTemplateValidationError(issues);

    this.insertStmt.run(
      parsed.name,
      parsed.description,
      parsed.source,
      JSON.stringify(parsed.variables),
      JSON.stringify(parsed.geometry),
    );
    return this.get(parsed.name);
  }

  /**
   * Update an existing template. Throws TemplateNotFoundError if missing and
   * StringTemplateValidationError if the new TSPL/manifest is invalid.
   */
  update(name: string, input: UpdateTemplateInput): StringTemplate {
    // Defense in depth: parse with the schema here too, not only at the route
    // layer, so the repository stays safe for any caller.
    const parsed = updateTemplateSchema.parse(input);

    if (!this.exists(name)) throw new TemplateNotFoundError(name);

    const issues = validateStringTemplate(parsed.source, parsed.variables);
    if (issues.length > 0) throw new StringTemplateValidationError(issues);

    this.updateStmt.run(
      parsed.description,
      parsed.source,
      JSON.stringify(parsed.variables),
      JSON.stringify(parsed.geometry),
      name,
    );
    return this.get(name);
  }

  /** Delete a template. Throws TemplateNotFoundError if it does not exist. */
  delete(name: string): void {
    const result = this.deleteStmt.run(name);
    if (result.changes === 0) throw new TemplateNotFoundError(name);
  }
}
