import { z } from 'zod';
import { escapeTsplString } from '../tspl/builder.js';

/**
 * A user-authored, DB-stored print template: raw TSPL text with
 * `{{placeholders}}` plus a manifest describing the variables it expects.
 *
 * Authoring/editing a template means editing the TSPL directly (in a file or
 * the UI) — no coordinate maths in code. The variable manifest drives payload
 * validation and the UI form.
 *
 * This module owns the whole stored-template concern: the schemas, structural
 * validation, and the `{{placeholder}}` render engine.
 */

/** Matches a `{{ name }}` placeholder; captures the trimmed variable name. */
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/** A value that can be substituted into a placeholder. */
export type TemplateValue = string | number | boolean;

/**
 * Return the distinct placeholder names referenced in `source`, in first-seen
 * order. Drives validation, the placeholder audit, and the UI form.
 */
export function extractPlaceholders(source: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const match of source.matchAll(PLACEHOLDER_RE)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

/**
 * Substitute `{{placeholders}}` in `source` with values from `data`, returning
 * the rendered TSPL. Every substituted value is passed through
 * `escapeTsplString`, so a value like `foo"\r\nPRINT 99` cannot terminate a
 * quoted argument or inject a command. Missing values render as empty string;
 * `renderTemplate` enforces required-variable presence separately.
 */
export function renderStringTemplate(
  source: string,
  data: Record<string, TemplateValue | undefined | null>,
): string {
  return source.replace(PLACEHOLDER_RE, (_full, rawName: string) => {
    const value = data[rawName.trim()];
    return value === undefined || value === null ? '' : escapeTsplString(String(value));
  });
}

/** One declared template variable. */
export const templateVariableSchema = z.object({
  /** Placeholder name as it appears in `{{name}}`. */
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'name may contain letters, digits, _ . - only'),
  /** Whether a value must be supplied at print time. */
  required: z.boolean().default(true),
  /** Optional human description shown in the UI. */
  description: z.string().optional(),
  /** Optional sample value used for preview and save-time validation. */
  sample: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export type TemplateVariable = z.infer<typeof templateVariableSchema>;

/** The persisted geometry a template is designed for (drives preview canvas). */
export const templateGeometrySchema = z.object({
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  dpmm: z.number().positive(),
});

export type TemplateGeometry = z.infer<typeof templateGeometrySchema>;

/** Fields common to create/update. */
const templateBodyShape = {
  description: z.string().default(''),
  /** Raw TSPL with `{{placeholders}}`. */
  source: z.string().min(1),
  variables: z.array(templateVariableSchema).default([]),
  geometry: templateGeometrySchema,
};

/** POST body to create a template. */
export const createTemplateSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9_-]+$/, 'name may contain letters, digits, _ - only'),
  ...templateBodyShape,
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

/** PUT body to update a template (name comes from the URL). */
export const updateTemplateSchema = z.object(templateBodyShape);

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

/** A full template record as stored and returned by the API. */
export interface StringTemplate {
  name: string;
  description: string;
  source: string;
  variables: TemplateVariable[];
  geometry: TemplateGeometry;
  updatedAt: string;
}

/** A validation problem found in a template's TSPL or variable manifest. */
export interface TemplateIssue {
  /** Machine-readable code, e.g. "missing-size". */
  code: string;
  /** Human-readable explanation. */
  message: string;
}

/**
 * Validate a template's TSPL structure and placeholder/variable consistency.
 * This runs at save time so a broken template is rejected before it can be
 * stored or printed. It does not need a full TSPL parser — it enforces the
 * non-negotiable structural rules and the manifest audit.
 *
 * Returns a list of issues (empty = valid).
 */
export function validateStringTemplate(
  source: string,
  variables: TemplateVariable[],
): TemplateIssue[] {
  const issues: TemplateIssue[] = [];

  // --- Structural TSPL rules (see the tspl-authoring skill checklist) ----
  const lines = source
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const firstCommand = lines[0]?.split(/\s+/)[0]?.toUpperCase();
  if (firstCommand !== 'SIZE') {
    issues.push({ code: 'missing-size', message: 'Template must start with a SIZE command.' });
  }
  const hasPrint = lines.some((l) => /^PRINT\b/i.test(l));
  if (!hasPrint) {
    issues.push({ code: 'missing-print', message: 'Template must contain a PRINT command.' });
  }
  const hasStock = lines.some((l) => /^(GAP|BLINE)\b/i.test(l));
  if (!hasStock) {
    issues.push({
      code: 'missing-stock',
      message: 'Template should contain a GAP or BLINE command for label detection.',
    });
  }

  // --- Placeholder / variable manifest audit -----------------------------
  const used = new Set(extractPlaceholders(source));
  const declared = new Set(variables.map((v) => v.name));

  for (const name of used) {
    if (!declared.has(name)) {
      issues.push({
        code: 'undeclared-variable',
        message: `Placeholder "{{${name}}}" is used but not declared in variables.`,
      });
    }
  }
  for (const v of variables) {
    if (!used.has(v.name)) {
      issues.push({
        code: 'unused-variable',
        message: `Declared variable "${v.name}" is not used in the template.`,
      });
    }
  }

  return issues;
}

/** Thrown when a template fails structural/manifest validation. */
export class StringTemplateValidationError extends Error {
  constructor(public readonly issues: TemplateIssue[]) {
    super(`Invalid template: ${issues.map((i) => i.code).join(', ')}`);
    this.name = 'StringTemplateValidationError';
  }
}

/** Thrown when required variables are missing from a print/preview payload. */
export class MissingVariablesError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Missing required variables: ${missing.join(', ')}`);
    this.name = 'MissingVariablesError';
  }
}

/**
 * Render a template to TSPL for the given data. Validates that every REQUIRED
 * declared variable has a value; optional variables may be omitted (they render
 * as empty). Throws MissingVariablesError when required values are absent.
 */
export function renderTemplate(
  template: StringTemplate,
  data: Record<string, TemplateValue | undefined | null>,
): string {
  const requiredMissing = template.variables
    .filter((v) => v.required)
    .map((v) => v.name)
    .filter((name) => data[name] === undefined || data[name] === null || data[name] === '');

  if (requiredMissing.length > 0) {
    throw new MissingVariablesError(requiredMissing);
  }

  const tspl = renderStringTemplate(template.source, data);
  return normalizeTsplLineEndings(tspl);
}

/**
 * TSPL requires every command line to end with CRLF (CR, LF). Template sources
 * may be authored with LF-only or mixed endings; normalise to CRLF and ensure a
 * trailing CRLF so the printer can parse the program. This mirrors what
 * buildRawProgram/buildLabel emit for the other print paths.
 */
export function normalizeTsplLineEndings(tspl: string): string {
  const normalized = tspl
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line.length > 0)
    .join('\r\n');
  return normalized.length > 0 ? normalized + '\r\n' : normalized;
}

/**
 * Build a data object from the declared variables' sample values — used to
 * preview or validate a template without a caller-supplied payload.
 */
export function sampleData(
  variables: TemplateVariable[],
): Record<string, TemplateValue> {
  const data: Record<string, TemplateValue> = {};
  for (const v of variables) {
    data[v.name] = v.sample ?? `{${v.name}}`;
  }
  return data;
}
