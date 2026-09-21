import type {
  BarcodeElement,
  LabelElement,
  LabelGeometry,
  LabelSpec,
  Rotation,
  TextElement,
} from './types.js';
import { mmToDots } from './builder.js';

/**
 * Options for the built-in demo/test label.
 */
export interface TestLabelOptions {
  geometry: LabelGeometry;
  /** Dots per mm for the target printhead (8 = 203 dpi, 11.8 = 300 dpi). */
  dpmm: number;
  /**
   * When true, all content is rotated 90 degrees so it reads across the LONG
   * edge of the label (landscape). The physical stock is unchanged.
   */
  landscape: boolean;
  /** Optional text overrides. */
  fontText?: string;
  barcodeData?: string;
  windowsText?: string;
  inlineText?: string;
}

/**
 * Build the demo/test label.
 *
 * Positions are COMPUTED from the label geometry and printhead resolution, so
 * the label fits any stock/DPI without overflowing (consistent with the
 * geometry-drives-layout principle used elsewhere).
 *
 *  - Portrait: rows stack down the label; `x` is a shared left margin.
 *  - Landscape: rotation = 90; content reads across the long edge, so `y` is
 *    the shared cross-margin and `x` steps along the label length.
 */
export function buildTestLabelSpec(opts: TestLabelOptions): LabelSpec {
  const W = mmToDots(opts.geometry.widthMm, opts.dpmm);
  const H = mmToDots(opts.geometry.heightMm, opts.dpmm);
  const margin = Math.round(Math.min(W, H) * 0.08);

  const fontText = opts.fontText ?? 'Font Test';
  const barcodeData = opts.barcodeData ?? '123456';
  const windowsText = opts.windowsText ?? 'Windowsfont Test';
  const inlineText = opts.inlineText ?? 'Text Test!!';

  const elements: LabelElement[] = opts.landscape
    ? buildLandscape(W, margin, { fontText, barcodeData, windowsText, inlineText })
    : buildPortrait(H, margin, { fontText, barcodeData, windowsText, inlineText });

  return {
    geometry: opts.geometry,
    elements,
    quantity: 1,
    copies: 1,
  };
}

interface TestTexts {
  fontText: string;
  barcodeData: string;
  windowsText: string;
  inlineText: string;
}

/** Portrait: four rows stacked down the label height. */
function buildPortrait(H: number, margin: number, t: TestTexts): LabelElement[] {
  const usableH = H - 2 * margin;
  const row = (n: number): number => Math.round(margin + (usableH * n) / 4);
  const barcodeHeight = Math.max(40, Math.round(H * 0.12));

  return [
    mkText(margin, row(0), '3', 0, 1, 1, t.fontText),
    mkBarcode(margin, row(1), '128', barcodeHeight, 0, 0, 3, 1, t.barcodeData),
    mkText(margin, row(2), '0', 0, 12, 12, t.windowsText),
    mkText(margin, row(3), '0', 0, 10, 10, t.inlineText),
  ];
}

/** Landscape: content rotated 90°, columns stepping along the label length. */
function buildLandscape(W: number, margin: number, t: TestTexts): LabelElement[] {
  const rotation: Rotation = 90;
  const usableW = W - 2 * margin;
  const col = (n: number): number => Math.round(margin + (usableW * n) / 4);
  const barcodeHeight = Math.max(40, Math.round(W * 0.12));

  return [
    mkText(col(0), margin, '3', rotation, 1, 1, t.fontText),
    mkBarcode(col(1), margin, '128', barcodeHeight, 0, rotation, 3, 1, t.barcodeData),
    mkText(col(2), margin, '0', rotation, 12, 12, t.windowsText),
    mkText(col(3), margin, '0', rotation, 10, 10, t.inlineText),
  ];
}

function mkText(
  x: number,
  y: number,
  font: string,
  rotation: Rotation,
  xMultiplier: number,
  yMultiplier: number,
  content: string,
): TextElement {
  return { kind: 'text', x, y, font, rotation, xMultiplier, yMultiplier, content };
}

function mkBarcode(
  x: number,
  y: number,
  type: string,
  height: number,
  readable: 0 | 1 | 2,
  rotation: Rotation,
  narrow: number,
  wide: number,
  content: string,
): BarcodeElement {
  return { kind: 'barcode', x, y, type, height, readable, rotation, narrow, wide, content };
}
