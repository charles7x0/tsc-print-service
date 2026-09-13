import { describe, expect, it } from 'vitest';
import {
  extractPlaceholders,
  renderStringTemplate,
} from '../src/templates/render.js';
import {
  validateStringTemplate,
  renderTemplate,
  MissingVariablesError,
  type StringTemplate,
  type TemplateVariable,
} from '../src/templates/string-template.js';

describe('extractPlaceholders', () => {
  it('returns distinct placeholder names in first-seen order', () => {
    const src = 'TEXT 0,0,"3",0,1,1,"{{id}} {{id}} {{name}}"';
    expect(extractPlaceholders(src)).toEqual(['id', 'name']);
  });

  it('tolerates whitespace inside braces', () => {
    expect(extractPlaceholders('{{ id }} {{  name  }}')).toEqual(['id', 'name']);
  });

  it('returns empty array when there are no placeholders', () => {
    expect(extractPlaceholders('SIZE 45 mm,75 mm')).toEqual([]);
  });
});

describe('renderStringTemplate', () => {
  it('substitutes values', () => {
    const { tspl } = renderStringTemplate('Hello {{who}}', { who: 'world' });
    expect(tspl).toBe('Hello world');
  });

  it('stringifies numbers and booleans', () => {
    const { tspl } = renderStringTemplate('{{n}}-{{b}}', { n: 42, b: true });
    expect(tspl).toBe('42-true');
  });

  it('reports missing placeholders and renders them empty', () => {
    const { tspl, missing } = renderStringTemplate('a{{x}}b{{y}}', { x: '1' });
    expect(tspl).toBe('a1b');
    expect(missing).toEqual(['y']);
  });

  it('escapes values so they cannot break out of a quoted argument', () => {
    // A malicious value with an embedded quote + CRLF + a PRINT command.
    const evil = 'X"\r\nPRINT 99,99';
    const { tspl } = renderStringTemplate('TEXT 0,0,"3",0,1,1,"{{v}}"', { v: evil });
    // The quote, CR and LF are stripped, so no argument break and no injected line.
    expect(tspl).toBe('TEXT 0,0,"3",0,1,1,"XPRINT 99,99"');
    expect(tspl).not.toContain('"X"');
    expect(tspl.split('\n')).toHaveLength(1);
  });
});

describe('validateStringTemplate', () => {
  const okVars: TemplateVariable[] = [{ name: 'id', required: true }];
  const okSource = 'SIZE 45 mm,75 mm\nGAP 3 mm,0 mm\nCLS\nTEXT 0,0,"3",0,1,1,"{{id}}"\nPRINT 1,1';

  it('accepts a well-formed template', () => {
    expect(validateStringTemplate(okSource, okVars)).toEqual([]);
  });

  it('flags a missing SIZE command', () => {
    const issues = validateStringTemplate('CLS\nPRINT 1', []);
    expect(issues.map((i) => i.code)).toContain('missing-size');
  });

  it('flags a missing PRINT command', () => {
    const issues = validateStringTemplate('SIZE 45 mm,75 mm\nGAP 3 mm,0 mm\nCLS', []);
    expect(issues.map((i) => i.code)).toContain('missing-print');
  });

  it('flags a missing GAP/BLINE stock command', () => {
    const issues = validateStringTemplate('SIZE 45 mm,75 mm\nCLS\nPRINT 1', []);
    expect(issues.map((i) => i.code)).toContain('missing-stock');
  });

  it('flags an undeclared placeholder', () => {
    const issues = validateStringTemplate(okSource, []);
    expect(issues.map((i) => i.code)).toContain('undeclared-variable');
  });

  it('flags a declared-but-unused variable', () => {
    const issues = validateStringTemplate(okSource, [
      { name: 'id', required: true },
      { name: 'ghost', required: false },
    ]);
    expect(issues.map((i) => i.code)).toContain('unused-variable');
  });
});

describe('renderTemplate (required-variable enforcement)', () => {
  const template: StringTemplate = {
    name: 't',
    description: '',
    source: 'SIZE 45 mm,75 mm\nGAP 3 mm,0 mm\nCLS\nTEXT 0,0,"3",0,1,1,"{{id}} {{note}}"\nPRINT 1,1',
    variables: [
      { name: 'id', required: true },
      { name: 'note', required: false },
    ],
    geometry: { widthMm: 45, heightMm: 75, dpmm: 8 },
    updatedAt: '',
  };

  it('renders when all required variables are provided', () => {
    const tspl = renderTemplate(template, { id: 'ABC' });
    expect(tspl).toContain('"ABC "'); // note omitted -> empty
  });

  it('throws MissingVariablesError when a required variable is absent', () => {
    expect(() => renderTemplate(template, { note: 'x' })).toThrow(MissingVariablesError);
  });

  it('lists the missing required variable names', () => {
    try {
      renderTemplate(template, {});
    } catch (err) {
      expect(err).toBeInstanceOf(MissingVariablesError);
      expect((err as MissingVariablesError).missing).toEqual(['id']);
    }
  });

  it('treats an empty string as missing for a required variable', () => {
    expect(() => renderTemplate(template, { id: '' })).toThrow(MissingVariablesError);
  });
});
