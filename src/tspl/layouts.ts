import type {
  BarcodeElement,
  BarElement,
  BoxElement,
  LabelElement,
  LabelGeometry,
  LabelSpec,
  QrcodeElement,
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

// ---------------------------------------------------------------------------
// Defect Analysis Tag — a parameterized template.
//
// All coordinates are COMPUTED from the label geometry and dot density, so the
// layout scales to any label size / printhead DPI and can never overflow the
// label or collide (positions are derived from fractions of the usable area,
// and gauge fills are clamped to their track).
// ---------------------------------------------------------------------------

/** One labelled gauge on the defect tag. */
export interface GaugeInput {
  /** Short label, e.g. "TCA". */
  label: string;
  /** Current value. */
  value: number;
  /** Maximum for the scale (defaults to 100). */
  max?: number;
}

export interface DefectTagInput {
  geometry: LabelGeometry;
  /** Dots per mm for the target printhead (8 = 203 dpi, 11.8 = 300 dpi). */
  dpmm: number;
  /** Identifier shown in the header, e.g. "AGM24V_LINE2". */
  id: string;
  /** Timestamp text shown under the id. */
  timestamp: string;
  /** Data encoded in the QR code (defaults to `id`). */
  qrData?: string;
  /** Footer caption. */
  footer?: string;
  /** The gauges to render (laid out top-to-bottom, full width). */
  gauges: GaugeInput[];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function mkBar(x: number, y: number, width: number, height: number): BarElement {
  return { kind: 'bar', x, y, width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

function mkBox(x: number, y: number, xEnd: number, yEnd: number, thickness: number): BoxElement {
  return { kind: 'box', x: Math.round(x), y: Math.round(y), xEnd: Math.round(xEnd), yEnd: Math.round(yEnd), thickness };
}

function mkQr(x: number, y: number, cellWidth: number, content: string): QrcodeElement {
  return { kind: 'qrcode', x: Math.round(x), y: Math.round(y), ecc: 'M', cellWidth, rotation: 0, content };
}

/**
 * Build the Defect Analysis Tag.
 *
 * Layout (native orientation, top-to-bottom — guaranteed to fit):
 *   ┌───────────────────────────┐
 *   │ [QR]  <id>                 │  header band
 *   │       <timestamp>          │
 *   ├───────────────────────────┤
 *   │ LABEL   value  [====█    ] │  one gauge row per gauge,
 *   │ ...                        │  full-width proportional bar
 *   ├───────────────────────────┤
 *   │ <footer>                   │  footer band
 *   └───────────────────────────┘
 *
 * To print rotated 90° (landscape reading), set geometry.direction — the whole
 * label flips via the DIRECTION command without changing this layout.
 */
export function buildDefectTagSpec(input: DefectTagInput): LabelSpec {
  const { geometry, dpmm } = input;

  // Usable canvas in dots, with a uniform margin.
  const W = Math.round(geometry.widthMm * dpmm);
  const H = Math.round(geometry.heightMm * dpmm);
  const margin = Math.round(Math.min(W, H) * 0.05);

  const left = margin;
  const right = W - margin;
  const top = margin;
  const bottom = H - margin;
  const innerW = right - left;

  const elements: LabelElement[] = [];

  // Outer border.
  elements.push(mkBox(left, top, right, bottom, 2));

  // --- Header band -------------------------------------------------------
  // QR sized so it fits the header height; header is ~22% of the label height.
  const headerBottom = top + Math.round((bottom - top) * 0.22);
  const headerH = headerBottom - top;
  const qrPad = Math.round(margin * 0.8);
  // Choose a QR cell width so ~25 modules fit within the header height.
  const qrCell = clamp(Math.floor((headerH - 2 * qrPad) / 25), 2, 8);
  const qrSize = qrCell * 25;
  const qrX = left + qrPad;
  const qrY = top + Math.round((headerH - qrSize) / 2);
  elements.push(mkQr(qrX, qrY, qrCell, input.qrData ?? input.id));

  // Header text to the right of the QR.
  const textX = qrX + qrSize + qrPad;
  elements.push(mkText(textX, top + Math.round(headerH * 0.18), '3', 0, 1, 1, input.id));
  elements.push(mkText(textX, top + Math.round(headerH * 0.55), '2', 0, 1, 1, input.timestamp));

  // Divider under the header.
  elements.push(mkBar(left, headerBottom, innerW, 2));

  // --- Footer band -------------------------------------------------------
  const footerTop = bottom - Math.round((bottom - top) * 0.16);
  elements.push(mkBar(left, footerTop, innerW, 2));
  elements.push(
    mkText(left + qrPad, footerTop + Math.round((bottom - footerTop) * 0.28), '3', 0, 1, 1, input.footer ?? 'Defect Analysis Tag'),
  );

  // --- Gauge rows --------------------------------------------------------
  const gaugeAreaTop = headerBottom + margin;
  const gaugeAreaBottom = footerTop - margin;
  const gaugeAreaH = gaugeAreaBottom - gaugeAreaTop;
  const rows = Math.max(1, input.gauges.length);
  const rowH = gaugeAreaH / rows;

  // Column geometry within a row: label | value | track.
  const labelW = Math.round(innerW * 0.28);
  const valueW = Math.round(innerW * 0.16);
  const trackX = left + labelW + valueW;
  const trackW = right - trackX - qrPad;
  const barThickness = clamp(Math.round(rowH * 0.5), 6, 40);

  input.gauges.forEach((g, i) => {
    const rowTop = gaugeAreaTop + i * rowH;
    const textY = Math.round(rowTop + (rowH - 24) / 2);
    const trackY = Math.round(rowTop + (rowH - barThickness) / 2);

    // Label and value.
    elements.push(mkText(left + qrPad, textY, '3', 0, 1, 1, g.label));
    elements.push(mkText(left + labelW, textY, '3', 0, 1, 1, formatValue(g.value)));

    // Track outline + proportional fill (clamped so it never exceeds the track).
    elements.push(mkBox(trackX, trackY, trackX + trackW, trackY + barThickness, 1));
    const frac = clamp(g.value / (g.max ?? 100), 0, 1);
    const fillW = Math.round((trackW - 4) * frac);
    if (fillW > 0) {
      elements.push(mkBar(trackX + 2, trackY + 2, fillW, barThickness - 4));
    }
  });

  return {
    geometry,
    elements,
    quantity: 1,
    copies: 1,
  };
}

/** Format a gauge value, trimming trailing zeros (e.g. 12.30 -> "12.3"). */
function formatValue(v: number): string {
  return Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(2)));
}
