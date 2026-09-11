import { describe, expect, it } from 'vitest';
import { buildDefectTagSpec } from '../src/tspl/layouts.js';
import { buildLabel } from '../src/tspl/builder.js';
import type { LabelGeometry } from '../src/tspl/types.js';

const geometry: LabelGeometry = {
  widthMm: 45,
  heightMm: 75,
  gapMm: 3,
  direction: 0,
  mirror: 0,
};

const gauges = [
  { label: 'TCA', value: 84 },
  { label: 'TCF', value: 62 },
  { label: 'TCAR', value: 93 },
  { label: 'IMP', value: 45 },
  { label: 'TAX', value: 78 },
  { label: 'CM', value: 12.3 },
];

function build(dpmm = 8, geom = geometry) {
  return buildDefectTagSpec({
    geometry: geom,
    dpmm,
    id: 'AGM24V_LINE2',
    timestamp: '11/09/2026 10:15:32',
    gauges,
  });
}

/** Collect the axis-aligned bounding box of every positioned element. */
function bounds(spec: ReturnType<typeof build>) {
  let maxX = 0;
  let maxY = 0;
  for (const el of spec.elements) {
    if (el.kind === 'bar') {
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    } else if (el.kind === 'box') {
      maxX = Math.max(maxX, el.xEnd);
      maxY = Math.max(maxY, el.yEnd);
    } else if (el.kind === 'qrcode') {
      maxX = Math.max(maxX, el.x + el.cellWidth * 25);
      maxY = Math.max(maxY, el.y + el.cellWidth * 25);
    } else if (el.kind === 'text') {
      maxX = Math.max(maxX, el.x);
      maxY = Math.max(maxY, el.y);
    }
  }
  return { maxX, maxY };
}

describe('buildDefectTagSpec', () => {
  it('keeps all drawn elements within the label bounds (203 dpi)', () => {
    const spec = build(8);
    const W = 45 * 8;
    const H = 75 * 8;
    const { maxX, maxY } = bounds(spec);
    expect(maxX).toBeLessThanOrEqual(W);
    expect(maxY).toBeLessThanOrEqual(H);
  });

  it('keeps elements within bounds at 300 dpi too', () => {
    const spec = build(11.8);
    const W = Math.round(45 * 11.8);
    const H = Math.round(75 * 11.8);
    const { maxX, maxY } = bounds(spec);
    expect(maxX).toBeLessThanOrEqual(W);
    expect(maxY).toBeLessThanOrEqual(H);
  });

  it('scales to a different label size without overflow', () => {
    const big: LabelGeometry = { ...geometry, widthMm: 100, heightMm: 60 };
    const spec = build(8, big);
    const { maxX, maxY } = bounds(spec);
    expect(maxX).toBeLessThanOrEqual(100 * 8);
    expect(maxY).toBeLessThanOrEqual(60 * 8);
  });

  it('renders one label row per gauge with its label and value', () => {
    const tspl = buildLabel(build());
    for (const g of gauges) {
      expect(tspl).toContain(`"${g.label}"`);
    }
    expect(tspl).toContain('"84"');
    expect(tspl).toContain('"12.3"'); // trailing-zero trimming
  });

  it('maps gauge value to a proportional fill (higher value = wider bar)', () => {
    const spec = build();
    // Collect the fill bars in element order (they follow each track BOX).
    const fills: number[] = [];
    for (let i = 0; i < spec.elements.length; i++) {
      const el = spec.elements[i];
      const prev = spec.elements[i - 1];
      if (el.kind === 'bar' && prev && prev.kind === 'box') {
        fills.push(el.width);
      }
    }
    // We have 6 gauges; TCAR (93) fill should be wider than IMP (45).
    expect(fills.length).toBe(6);
    // Order of gauges: TCA84, TCF62, TCAR93, IMP45, TAX78, CM12.3
    expect(fills[2]).toBeGreaterThan(fills[3]); // 93 > 45
    expect(fills[3]).toBeGreaterThan(fills[5]); // 45 > 12.3
  });

  it('clamps an over-range value so the fill never exceeds the track', () => {
    const spec = buildDefectTagSpec({
      geometry,
      dpmm: 8,
      id: 'X',
      timestamp: 't',
      gauges: [{ label: 'OVER', value: 250, max: 100 }],
    });
    // Find the track box and its fill.
    const boxIdx = spec.elements.findIndex((e) => e.kind === 'box' && e !== spec.elements[0]);
    const box = spec.elements[boxIdx];
    const fill = spec.elements[boxIdx + 1];
    if (box.kind !== 'box' || fill.kind !== 'bar') throw new Error('unexpected layout');
    const trackWidth = box.xEnd - box.x;
    expect(fill.width).toBeLessThanOrEqual(trackWidth);
  });

  it('produces valid TSPL with SIZE and PRINT', () => {
    const tspl = buildLabel(build());
    expect(tspl).toContain('SIZE 45 mm,75 mm');
    expect(tspl).toContain('QRCODE');
    expect(tspl.trimEnd().endsWith('PRINT 1,1')).toBe(true);
  });
});
