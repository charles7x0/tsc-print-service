import type { Db } from './database.js';
import { SEED_TEMPLATES } from './templateSeeds.js';
import {
  createTemplateSchema,
  templateGeometrySchema,
  templateVariableSchema,
  validateStringTemplate,
  StringTemplateValidationError,
  type CreateTemplateInput,
  type StringTemplate,
  type TemplateGeometry,
  type TemplateVariable,
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
  constructor(public readonly name: string) {
    super(`Template not found: "${name}"`);
    this.name = 'TemplateNotFoundError';
  }
}

/** Thrown when creating a template whose name already exists. */
export class TemplateExistsError extends Error {
  constructor(public readonly name: string) {
    super(`Template already exists: "${name}"`);
    this.name = 'TemplateExistsError';
  }
}

const variablesArraySchema = z.array(templateVariableSchema);

/**
 * Reads and writes user-authored TSPL string templates backed by the SQLite
 * `templates` table. Mirrors SettingsRepository: prepared statements,
 * transactional writes, and default seeding on construction.
 *
 * Every write is validated (structural TSPL rules + placeholder/variable
 * consistency) so a broken template can never be persisted.
 */
export class TemplatesRepository {
  private readonly selectAllStmt;
  private readonly selectOneStmt;
  private readonly insertStmt;
  private readonly updateStmt;
  private readonly deleteStmt;
  private readonly countStmt;

  constructor(private readonly db: Db) {
    this.selectAllStmt = db.prepare(
      'SELECT name, description, source, variables, geometry, updated_at FROM templates ORDER BY name',
    );
    this.selectOneStmt = db.prepare<[string]>(
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
    this.countStmt = db.prepare<[string]>('SELECT COUNT(*) AS n FROM templates WHERE name = ?');
    this.seedDefaults();
  }

  /** Insert built-in templates that are not already present. */
  private seedDefaults(): void {
    const seed = this.db.transaction(() => {
      for (const tpl of SEED_TEMPLATES) {
        const row = this.countStmt.get(tpl.name) as { n: number };
        if (row.n === 0) {
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
      variables: variablesArraySchema.parse(JSON.parse(row.variables)) as TemplateVariable[],
      geometry: templateGeometrySchema.parse(JSON.parse(row.geometry)) as TemplateGeometry,
      updatedAt: row.updated_at,
    };
  }

  /** List all templates (ordered by name). */
  list(): StringTemplate[] {
    const rows = this.selectAllStmt.all() as TemplateRow[];
    return rows.map((r) => this.rowToTemplate(r));
  }

  /** Return true if a template with the given name exists. */
  has(name: string): boolean {
    return (this.countStmt.get(name) as { n: number }).n > 0;
  }

  /** Get a template by name or throw TemplateNotFoundError. */
  get(name: string): StringTemplate {
    const row = this.selectOneStmt.get(name) as TemplateRow | undefined;
    if (!row) throw new TemplateNotFoundError(name);
    return this.rowToTemplate(row);
  }

  /**
   * Create a new template. Throws TemplateExistsError if the name is taken and
   * StringTemplateValidationError if the TSPL/manifest is invalid.
   */
  create(input: CreateTemplateInput): StringTemplate {
    if (this.has(input.name)) throw new TemplateExistsError(input.name);

    const issues = validateStringTemplate(input.source, input.variables);
    if (issues.length > 0) throw new StringTemplateValidationError(issues);

    this.insertStmt.run(
      input.name,
      input.description,
      input.source,
      JSON.stringify(input.variables),
      JSON.stringify(input.geometry),
    );
    return this.get(input.name);
  }

  /**
   * Update an existing template. Throws TemplateNotFoundError if missing and
   * StringTemplateValidationError if the new TSPL/manifest is invalid.
   */
  update(name: string, input: UpdateTemplateInput): StringTemplate {
    if (!this.has(name)) throw new TemplateNotFoundError(name);

    const issues = validateStringTemplate(input.source, input.variables);
    if (issues.length > 0) throw new StringTemplateValidationError(issues);

    this.updateStmt.run(
      input.description,
      input.source,
      JSON.stringify(input.variables),
      JSON.stringify(input.geometry),
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
