import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { openDatabase, type Db } from '../src/db/database.js';
import {
  TemplatesRepository,
  TemplateNotFoundError,
  TemplateExistsError,
} from '../src/db/templatesRepository.js';
import {
  renderTemplate,
  StringTemplateValidationError,
  type CreateTemplateInput,
} from '../src/templates/string-template.js';

const SEED_NAME = 'tad-inspecao-defect-taxa';

/** A minimal valid template used across create/update tests. */
function validInput(name: string): CreateTemplateInput {
  return {
    name,
    description: 'test',
    source: 'SIZE 45 mm,75 mm\nGAP 3 mm,0 mm\nCLS\nTEXT 0,0,"3",0,1,1,"{{id}}"\nPRINT 1,1',
    variables: [{ name: 'id', required: true }],
    geometry: { widthMm: 45, heightMm: 75, dpmm: 8 },
  };
}

/** The data that reproduces the approved reference label. */
const REFERENCE_DATA: Record<string, string> = {
  qrData: 'AGM24V-L2',
  id: 'AGM24V-L2',
  timestamp: '11/09/2026 10:15:32',
  footer: 'BATTERY DEFECT ANALYSIS',
  m0_label: 'TCA', m0_value: '84', m0_ci: '78-88',
  m1_label: 'TCF', m1_value: '62', m1_ci: '55-70',
  m2_label: 'TCAR', m2_value: '93', m2_ci: '85-95',
  m3_label: 'IMP', m3_value: '45', m3_ci: '40-55',
  m4_label: 'TAXA', m4_value: '78', m4_ci: '70-85',
  m5_label: 'CM', m5_value: '12.3', m5_ci: '10-15',
};

/** The exact approved raw TSPL (shifted-left layout, cell-7 QR). */
const EXPECTED_TSPL = [
  'SIZE 45 mm,75 mm',
  'GAP 3 mm,0 mm',
  'DIRECTION 1,0',
  'REFERENCE 0,0',
  'CLS',
  'CODEPAGE UTF-8',
  'QRCODE 330,20,M,7,A,90,"AGM24V-L2"',
  'TEXT 305,200,"5",90,1,1,"AGM24V-L2"',
  'TEXT 245,200,"3",90,1,1,"11/09/2026 10:15:32"',
  'BAR 165,15,3,570',
  'TEXT 150,40,"2",90,1,1,"TCA 84"',
  'TEXT 130,40,"1",90,1,1,"CI 78-88"',
  'TEXT 150,240,"2",90,1,1,"TCF 62"',
  'TEXT 130,240,"1",90,1,1,"CI 55-70"',
  'TEXT 150,440,"2",90,1,1,"TCAR 93"',
  'TEXT 130,440,"1",90,1,1,"CI 85-95"',
  'BAR 115,15,3,570',
  'TEXT 100,40,"2",90,1,1,"IMP 45"',
  'TEXT 80,40,"1",90,1,1,"CI 40-55"',
  'TEXT 100,240,"2",90,1,1,"TAXA 78"',
  'TEXT 80,240,"1",90,1,1,"CI 70-85"',
  'TEXT 100,440,"2",90,1,1,"CM 12.3"',
  'TEXT 80,440,"1",90,1,1,"CI 10-15"',
  'BAR 65,15,3,570',
  'TEXT 40,40,"1",90,1,1,"BATTERY DEFECT ANALYSIS"',
  'PRINT 1,1',
].join('\n');

describe('TemplatesRepository', () => {
  let db: Db;
  let repo: TemplatesRepository;

  beforeEach(() => {
    db = openDatabase(':memory:');
    repo = TemplatesRepository.create(db);
  });

  afterEach(() => {
    db.close();
  });

  it('seeds the built-in defect template into a fresh database', () => {
    expect(repo.has(SEED_NAME)).toBe(true);
    const names = repo.list().map((t) => t.name);
    expect(names).toContain(SEED_NAME);
  });

  it('seeds the simple-label template (replacement for the former code template)', () => {
    expect(repo.has('simple-label')).toBe(true);
    const tpl = repo.get('simple-label');
    const tspl = renderTemplate(tpl, { line1: 'Hello', barcode: '123456' });
    expect(tspl).toContain('"Hello"');
    expect(tspl).toContain('BARCODE');
  });

  it('renders the seeded template to the approved raw TSPL exactly', () => {
    const template = repo.get(SEED_NAME);
    const tspl = renderTemplate(template, REFERENCE_DATA).replace(/\r\n/g, '\n').trim();
    expect(tspl).toBe(EXPECTED_TSPL);
  });

  it('renders with CRLF line endings and a trailing CRLF (required by TSPL)', () => {
    const template = repo.get(SEED_NAME);
    const tspl = renderTemplate(template, REFERENCE_DATA);
    expect(tspl.includes('\r\n')).toBe(true);
    // Every line break must be CRLF — no bare LFs.
    expect(/[^\r]\n/.test(tspl)).toBe(false);
    expect(tspl.endsWith('\r\n')).toBe(true);
  });

  it('gets a template by name', () => {
    const t = repo.get(SEED_NAME);
    expect(t.name).toBe(SEED_NAME);
    expect(t.variables.length).toBeGreaterThan(0);
    expect(t.geometry.widthMm).toBe(45);
  });

  it('throws TemplateNotFoundError for a missing template', () => {
    expect(() => repo.get('nope')).toThrow(TemplateNotFoundError);
  });

  it('creates a new template', () => {
    const created = repo.create(validInput('my-label'));
    expect(created.name).toBe('my-label');
    expect(repo.has('my-label')).toBe(true);
  });

  it('rejects a duplicate name', () => {
    repo.create(validInput('dup'));
    expect(() => repo.create(validInput('dup'))).toThrow(TemplateExistsError);
  });

  it('rejects an invalid template (missing PRINT) on create', () => {
    const bad = validInput('bad');
    bad.source = 'SIZE 45 mm,75 mm\nGAP 3 mm,0 mm\nCLS\nTEXT 0,0,"3",0,1,1,"{{id}}"';
    expect(() => repo.create(bad)).toThrow(StringTemplateValidationError);
  });

  it('rejects an undeclared placeholder on create', () => {
    const bad = validInput('bad2');
    bad.variables = []; // {{id}} used but not declared
    expect(() => repo.create(bad)).toThrow(StringTemplateValidationError);
  });

  it('updates an existing template', () => {
    repo.create(validInput('edit-me'));
    const updated = repo.update('edit-me', {
      description: 'changed',
      source: 'SIZE 50 mm,50 mm\nGAP 2 mm,0 mm\nCLS\nTEXT 0,0,"3",0,1,1,"{{id}}"\nPRINT 1,1',
      variables: [{ name: 'id', required: true }],
      geometry: { widthMm: 50, heightMm: 50, dpmm: 8 },
    });
    expect(updated.description).toBe('changed');
    expect(updated.geometry.widthMm).toBe(50);
  });

  it('throws TemplateNotFoundError when updating a missing template', () => {
    expect(() =>
      repo.update('ghost', validInput('ghost')),
    ).toThrow(TemplateNotFoundError);
  });

  it('deletes a template', () => {
    repo.create(validInput('temp'));
    repo.delete('temp');
    expect(repo.has('temp')).toBe(false);
  });

  it('throws TemplateNotFoundError when deleting a missing template', () => {
    expect(() => repo.delete('ghost')).toThrow(TemplateNotFoundError);
  });

  it('persists templates across repository instances', () => {
    repo.create(validInput('persisted'));
    // Bare constructor reads existing data without re-seeding.
    const repo2 = new TemplatesRepository(db);
    expect(repo2.has('persisted')).toBe(true);
  });

  it('rejects an invalid name via schema (defense in depth) on create', () => {
    const bad = validInput('has spaces!'); // fails the name regex in createTemplateSchema
    expect(() => repo.create(bad)).toThrow();
  });
});

describe('TemplatesRepository construction', () => {
  it('bare constructor performs no writes (pure)', () => {
    const db = openDatabase(':memory:');
    // eslint-disable-next-line no-new
    new TemplatesRepository(db);
    const count = db.prepare('SELECT COUNT(*) AS n FROM templates').get() as { n: number };
    expect(count.n).toBe(0);
    db.close();
  });

  it('create() seeds built-in templates', () => {
    const db = openDatabase(':memory:');
    const repo = TemplatesRepository.create(db);
    expect(repo.has(SEED_NAME)).toBe(true);
    db.close();
  });
});
