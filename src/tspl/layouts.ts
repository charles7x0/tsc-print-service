import type {
  BarcodeElement,
  LabelElement,
  LabelGeometry,
  LabelSpec,
  Rotation,
  TextElement,
} from './types.js';

/**
 * Options for the built-in demo/test label.
 */
export interface TestLabelOptions {
  geometry: LabelGeometry;
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
 * Layout logic (validated on real hardware):
 *  - Landscape uses rotation = 90 on every element.
 *  - `y` is the shared left margin across the width; keep it constant.
 *  - `x` steps down the label length so the rows are spaced out.
 */
export function buildTestLabelSpec(opts: TestLabelOptions): LabelSpec {
  const rotation: Rotation = opts.landscape ? 90 : 0;
  const marginY = 30;

  const fontText = opts.fontText ?? 'Font Test';
  const barcodeData = opts.barcodeData ?? '123456';
  const windowsText = opts.windowsText ?? 'Windowsfont Test';
  const inlineText = opts.inlineText ?? 'Text Test!!';

  const elements: LabelElement[] = [];

  const font: TextElement = opts.landscape
    ? mkText(60, marginY, '3', rotation, 1, 1, fontText)
    : mkText(50, 50, '3', 0, 1, 1, fontText);

  const barcode: BarcodeElement = opts.landscape
    ? mkBarcode(180, marginY, '128', 70, 0, rotation, 3, 1, barcodeData)
    : mkBarcode(50, 100, '128', 70, 0, 0, 3, 1, barcodeData);

  const windows: TextElement = opts.landscape
    ? mkText(340, marginY, '0', rotation, 12, 12, windowsText)
    : mkText(50, 250, '0', 0, 12, 12, windowsText);

  const inline: TextElement = opts.landscape
    ? mkText(500, marginY, '0', rotation, 10, 10, inlineText)
    : mkText(250, 50, '0', 0, 10, 10, inlineText);

  elements.push(font, barcode, windows, inline);

  return {
    geometry: opts.geometry,
    elements,
    quantity: 1,
    copies: 1,
  };
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

// The parameterized "Defect Analysis Tag" layout was removed — that label is
// now a DB-stored, editable TSPL string template (`tad-inspecao-defect-taxa`),
// printed via /api/db-templates/:name/print.
