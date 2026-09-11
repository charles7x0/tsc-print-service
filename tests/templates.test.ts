import { describe, expect, it } from 'vitest';
import {
  createDefaultRegistry,
  TemplateRegistry,
  UnknownTemplateError,
  TemplateValidationError,
} from '../src/templates/index.js';
import type { RenderContext } from '../src/templates/types.js';

const CONTEXT: RenderContext = {
  geometry: { widthMm: 45, heightMm: 75, gapMm: 3, direction: 0, mirror: 0 },
  dpmm: 8,
};

describe('TemplateRegistry', () => {
  it('lists all registered templates', () => {
    const registry = createDefaultRegistry();
    const names = registry.list().map((t) => t.name);
    expect(names).toContain('defect-tag');
    expect(names).toContain('simple-label');
  });

  it('looks up a registered template by name', () => {
    const registry = createDefaultRegistry();
    expect(registry.has('defect-tag')).toBe(true);
    expect(registry.get('defect-tag').name).toBe('defect-tag');
  });

  it('throws UnknownTemplateError for a missing template', () => {
    const registry = createDefaultRegistry();
    expect(() => registry.get('nonexistent')).toThrow(UnknownTemplateError);
  });

  it('prevents duplicate registration', () => {
    const registry = new TemplateRegistry();
    const fake = { name: 'x', description: '', dataSchema: {} as never, render: () => ({}) as never };
    registry.register(fake);
    expect(() => registry.register(fake)).toThrow(/already registered/);
  });
});

describe('defect-tag template via registry', () => {
  it('validates and renders valid data', () => {
    const registry = createDefaultRegistry();
    const spec = registry.render('defect-tag', {
      id: 'AGM24V_LINE2',
      timestamp: '11/09/2026 10:15:32',
      gauges: [{ label: 'TCA', value: 84 }],
    }, CONTEXT);
    expect(spec.geometry.widthMm).toBe(45);
    expect(spec.elements.length).toBeGreaterThan(0);
  });

  it('throws TemplateValidationError on invalid data', () => {
    const registry = createDefaultRegistry();
    expect(() =>
      registry.render('defect-tag', { id: 'X' }, CONTEXT),
    ).toThrow(TemplateValidationError);
  });

  it('throws TemplateValidationError with issues listing missing fields', () => {
    const registry = createDefaultRegistry();
    try {
      registry.render('defect-tag', { id: 'X' }, CONTEXT);
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateValidationError);
      const ve = err as TemplateValidationError;
      const paths = ve.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('timestamp');
      expect(paths).toContain('gauges');
    }
  });

  it('keeps elements within label bounds', () => {
    const registry = createDefaultRegistry();
    const spec = registry.render('defect-tag', {
      id: 'X',
      timestamp: 't',
      gauges: [
        { label: 'A', value: 10 },
        { label: 'B', value: 99 },
        { label: 'C', value: 0 },
      ],
    }, CONTEXT);
    const W = 45 * 8;
    const H = 75 * 8;
    for (const el of spec.elements) {
      if (el.kind === 'bar') {
        expect(el.x + el.width).toBeLessThanOrEqual(W);
        expect(el.y + el.height).toBeLessThanOrEqual(H);
      } else if (el.kind === 'box') {
        expect(el.xEnd).toBeLessThanOrEqual(W);
        expect(el.yEnd).toBeLessThanOrEqual(H);
      }
    }
  });
});

describe('simple-label template via registry', () => {
  it('renders text lines and an optional barcode', () => {
    const registry = createDefaultRegistry();
    const spec = registry.render('simple-label', {
      lines: ['Line 1', 'Line 2'],
      barcode: { data: '12345' },
    }, CONTEXT);
    expect(spec.elements.length).toBe(3); // 2 texts + 1 barcode
    expect(spec.elements[0].kind).toBe('text');
    expect(spec.elements[2].kind).toBe('barcode');
  });

  it('works without a barcode', () => {
    const registry = createDefaultRegistry();
    const spec = registry.render('simple-label', {
      lines: ['Only text'],
    }, CONTEXT);
    expect(spec.elements.length).toBe(1);
    expect(spec.elements[0].kind).toBe('text');
  });

  it('applies default copies and barcode type', () => {
    const registry = createDefaultRegistry();
    const spec = registry.render('simple-label', {
      lines: ['X'],
      barcode: { data: 'ABC' },
    }, CONTEXT);
    expect(spec.copies).toBe(1);
    const bc = spec.elements.find((e) => e.kind === 'barcode');
    expect(bc).toBeDefined();
    if (bc && bc.kind === 'barcode') {
      expect(bc.type).toBe('128');
      expect(bc.readable).toBe(1);
    }
  });

  it('rejects empty lines array', () => {
    const registry = createDefaultRegistry();
    expect(() =>
      registry.render('simple-label', { lines: [] }, CONTEXT),
    ).toThrow(TemplateValidationError);
  });
});
