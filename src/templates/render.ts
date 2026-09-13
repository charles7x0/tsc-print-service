import { escapeTsplString } from '../tspl/builder.js';

/**
 * Render engine for raw-TSPL string templates.
 *
 * A template is plain TSPL text containing `{{placeholders}}`. This module
 * extracts the placeholders, substitutes values, and escapes each value so
 * caller-supplied data can never break out of a quoted TSPL argument or inject
 * extra commands.
 *
 * It is intentionally dependency-free and pure: no I/O, no printer, no DB. That
 * makes it trivial to unit-test and reuse from both the print path and the
 * preview endpoint.
 */

/** Matches a `{{ name }}` placeholder; captures the trimmed variable name. */
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/** A value that can be substituted into a placeholder. */
export type TemplateValue = string | number | boolean;

export interface RenderResult {
  /** The rendered TSPL with all placeholders substituted. */
  tspl: string;
  /** Placeholder names that had no value supplied (rendered as empty string). */
  missing: string[];
}

/**
 * Return the distinct placeholder names referenced in `source`, in first-seen
 * order. Used for validation, the placeholder audit, and to drive the UI form.
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
 * Convert a substitution value to its string form. Booleans and numbers are
 * stringified; strings pass through. `undefined`/`null` become empty string
 * (the caller is told which via `missing`).
 */
function stringifyValue(value: TemplateValue | undefined | null): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : String(value);
}

/**
 * Substitute `{{placeholders}}` in `source` with values from `data`.
 *
 * Every substituted value is passed through `escapeTsplString`, which strips
 * embedded double quotes, CR/LF and control characters — so a value like
 * `foo"\r\nPRINT 99` cannot terminate a quoted argument or inject a command.
 *
 * Placeholders with no corresponding value are replaced with an empty string
 * and reported in `missing`. This never throws; validation of "required" vars
 * happens against the declared manifest in string-template.ts.
 */
export function renderStringTemplate(
  source: string,
  data: Record<string, TemplateValue | undefined | null>,
): RenderResult {
  const missing: string[] = [];
  const missingSeen = new Set<string>();

  const tspl = source.replace(PLACEHOLDER_RE, (_full, rawName: string) => {
    const name = rawName.trim();
    const has = Object.prototype.hasOwnProperty.call(data, name) && data[name] != null;
    if (!has && !missingSeen.has(name)) {
      missingSeen.add(name);
      missing.push(name);
    }
    return escapeTsplString(stringifyValue(has ? data[name] : ''));
  });

  return { tspl, missing };
}
