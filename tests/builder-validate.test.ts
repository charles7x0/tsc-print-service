import { describe, expect, it } from 'vitest';
import { validateSpec } from '../src/tspl/builder.js';
import type { LabelGeometry, LabelSpec } from '../src/tspl/types.js';

const GEOMETRY: LabelGeometry = {
  widthMm: 45,
  heightMm: 75,
  gapMm: 3,
  direction: 0,
  mirror: 0,
};
// At 8 dpmm: 45mm = 360 dots wide, 75mm = 600 dots tall.
const DPMM = 8;

function spec(elements: LabelSpec['elements']): LabelSpec {
  return { geometry: GEOMETRY, elements, quantity: 1, copies: 1 };
}

describe('validateSpec', () => {
  it('accepts elements fully within the label', () => {
    const issues = validateSpec(
      spec([
        { kind: 'text', x: 20, y: 20, font: '3', rotation: 0, xMultiplier: 1, yMultiplier: 1, content: 'ok' },
        { kind: 'box', x: 10, y: 10, xEnd: 300, yEnd: 500, thickness: 2 },
        { kind: 'bar', x: 10, y: 10, width: 100, height: 50 },
      ]),
      DPMM,
    );
    expect(issues).toEqual([]);
  });

  it('flags a text origin past the label width', () => {
    const issues = validateSpec(
      spec([
        { kind: 'text', x: 400, y: 20, font: '3', rotation: 0, xMultiplier: 1, yMultiplier: 1, content: 'x' },
      ]),
      DPMM,
    );
    expect(issues.length).toBe(1);
    expect(issues[0].code).toBe('out-of-bounds');
  });

  it('flags a barcode whose bottom exceeds the label height', () => {
    const issues = validateSpec(
      spec([
        { kind: 'barcode', x: 20, y: 560, type: '128', height: 80, readable: 0, rotation: 0, narrow: 2, wide: 4, content: '1' },
      ]),
      DPMM,
    );
    // y (560) is in-bounds but y+height (640) exceeds 600.
    expect(issues.some((i) => i.message.includes('exceeds label height'))).toBe(true);
  });

  it('flags a bar that extends past the right edge', () => {
    const issues = validateSpec(spec([{ kind: 'bar', x: 300, y: 10, width: 200, height: 20 }]), DPMM);
    expect(issues.length).toBe(1);
  });

  it('flags a box corner outside the label', () => {
    const issues = validateSpec(spec([{ kind: 'box', x: 10, y: 10, xEnd: 400, yEnd: 700, thickness: 1 }]), DPMM);
    expect(issues.length).toBe(1);
  });

  it('does not validate raw elements', () => {
    const issues = validateSpec(spec([{ kind: 'raw', command: 'DENSITY 8' }]), DPMM);
    expect(issues).toEqual([]);
  });

  it('scales bounds with dpmm (300 dpi allows larger dot coords)', () => {
    // At 11.8 dpmm, 45mm ≈ 531 dots — an x of 400 that failed at 8 dpmm passes.
    const el: LabelSpec['elements'] = [
      { kind: 'text', x: 400, y: 20, font: '3', rotation: 0, xMultiplier: 1, yMultiplier: 1, content: 'x' },
    ];
    expect(validateSpec(spec(el), DPMM).length).toBe(1);
    expect(validateSpec(spec(el), 11.8)).toEqual([]);
  });
});
