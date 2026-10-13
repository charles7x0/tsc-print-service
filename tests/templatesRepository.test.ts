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

  it('seeds the built-in template into a fresh database', () => {
    expect(repo.has('simple-label')).toBe(true);
    const names = repo.list().map((t) => t.name);
    expect(names).toContain('simple-label');
  });

  it('seeds the simple-label template (replacement for the former code template)', () => {
    expect(repo.has('simple-label')).toBe(true);
    const tpl = repo.get('simple-label');
    const tspl = renderTemplate(tpl, { line1: 'Hello', barcode: '123456' });
    expect(tspl).toContain('"Hello"');
    expect(tspl).toContain('BARCODE');
  });

  it('renders with CRLF line endings and a trailing CRLF (required by TSPL)', () => {
    const template = repo.get('simple-label');
    const tspl = renderTemplate(template, { line1: 'Hello', barcode: '123456' });
    expect(tspl.includes('\r\n')).toBe(true);
    // Every line break must be CRLF — no bare LFs.
    expect(/[^\r]\n/.test(tspl)).toBe(false);
    expect(tspl.endsWith('\r\n')).toBe(true);
  });

  it('gets a template by name', () => {
    const t = repo.get('simple-label');
    expect(t.name).toBe('simple-label');
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
    expect(repo.has('simple-label')).toBe(true);
    db.close();
  });
});
