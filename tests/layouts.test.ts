import { describe, expect, it } from 'vitest';
import { buildTestLabelSpec } from '../src/tspl/layouts.js';
import { buildLabel } from '../src/tspl/builder.js';
import type { LabelGeometry } from '../src/tspl/types.js';

const geometry: LabelGeometry = {
  widthMm: 45,
  heightMm: 75,
  gapMm: 3,
  direction: 0,
  mirror: 0,
};

describe('buildTestLabelSpec', () => {
  it('rotates every element 90 degrees in landscape mode', () => {
    const spec = buildTestLabelSpec({ geometry, landscape: true });
    for (const el of spec.elements) {
      if (el.kind !== 'raw') {
        expect(el.rotation).toBe(90);
      }
    }
  });

  it('uses no rotation in portrait mode', () => {
    const spec = buildTestLabelSpec({ geometry, landscape: false });
    for (const el of spec.elements) {
      if (el.kind !== 'raw') {
        expect(el.rotation).toBe(0);
      }
    }
  });

  it('shares a constant left margin (y) across elements in landscape', () => {
    const spec = buildTestLabelSpec({ geometry, landscape: true });
    const ys = spec.elements
      .filter((e) => e.kind !== 'raw')
      .map((e) => (e as { y: number }).y);
    expect(new Set(ys).size).toBe(1);
  });

  it('steps elements down the length (increasing x) in landscape', () => {
    const spec = buildTestLabelSpec({ geometry, landscape: true });
    const xs = spec.elements
      .filter((e) => e.kind !== 'raw')
      .map((e) => (e as { x: number }).x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
    expect(new Set(xs).size).toBe(xs.length); // all distinct
  });

  it('honors text overrides', () => {
    const spec = buildTestLabelSpec({
      geometry,
      landscape: true,
      barcodeData: '999',
      fontText: 'Custom',
    });
    const tspl = buildLabel(spec);
    expect(tspl).toContain('"999"');
    expect(tspl).toContain('Custom');
  });

  it('produces valid TSPL with the configured geometry', () => {
    const spec = buildTestLabelSpec({ geometry, landscape: true });
    const tspl = buildLabel(spec);
    expect(tspl).toContain('SIZE 45 mm,75 mm');
    expect(tspl).toContain('PRINT 1,1');
  });
});
