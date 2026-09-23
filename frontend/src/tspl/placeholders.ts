import type { TemplateData, TemplateVariable } from '../lib/types';

/** Matches a `{{ name }}` placeholder; captures the trimmed variable name. */
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/**
 * Escape a value the same way the server's `escapeTsplString` does, so the
 * local live preview matches what will actually print. This is LOSSY by design:
 * double quotes and CR/LF are removed, other control characters collapse to a
 * space, so caller data can never break out of a quoted TSPL argument.
 */
export function escapeTsplValue(value: string): string {
  return value
    .replace(/["\r\n]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, ' ');
}

/** Distinct `{{placeholder}}` names in the source, in first-seen order. */
export function extractPlaceholders(source: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const m of source.matchAll(PLACEHOLDER_RE)) {
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

/**
 * Substitute `{{placeholders}}` in `source` with values from `data`, escaping
 * each value exactly as the server does. Missing values render as an empty
 * string. Mirrors the server's render engine so the preview is faithful.
 */
export function substitutePlaceholders(source: string, data: TemplateData): string {
  return source.replace(PLACEHOLDER_RE, (_full, rawName: string) => {
    const value = data[rawName.trim()];
    return value === undefined ? '' : escapeTsplValue(String(value));
  });
}

/** Build a data object from the variables' sample values (for preview/print). */
export function sampleData(variables: TemplateVariable[]): TemplateData {
  const data: TemplateData = {};
  for (const v of variables) {
    data[v.name] = v.sample ?? `{${v.name}}`;
  }
  return data;
}
