/**
 * TSPL domain types.
 *
 * All coordinates are in DOTS from the top-left origin (0,0).
 * Dots-per-mm depends on the printhead: 8 = 203 dpi, ~11.8 = 300 dpi, 24 = 600 dpi.
 */

/** Rotation in degrees, as supported by TSPL. */
export type Rotation = 0 | 90 | 180 | 270;

/** Physical label geometry and orientation. */
export interface LabelGeometry {
  /** Label width in millimetres. */
  widthMm: number;
  /** Label height in millimetres. */
  heightMm: number;
  /** Vertical gap between labels in millimetres (gap-sensor stock). */
  gapMm: number;
  /** Whole-label feed direction: 0 = normal, 1 = flipped 180 degrees. */
  direction: 0 | 1;
  /** Mirror image: 0 = normal, 1 = mirrored left-right. */
  mirror: 0 | 1;
}

/** Built-in printer bitmap font drawn with the TSPL TEXT command. */
export interface TextElement {
  kind: 'text';
  x: number;
  y: number;
  /** TSPL font name, e.g. "0".."8" or "ROMAN.TTF". */
  font: string;
  rotation: Rotation;
  /** Horizontal multiplier (1-10). */
  xMultiplier: number;
  /** Vertical multiplier (1-10). */
  yMultiplier: number;
  content: string;
}

/** 1D barcode drawn with the TSPL BARCODE command. */
export interface BarcodeElement {
  kind: 'barcode';
  x: number;
  y: number;
  /** Barcode type, e.g. "128", "39", "EAN13". */
  type: string;
  /** Barcode height in dots. */
  height: number;
  /** Human-readable interpretation: 0 = none, 1 = below, 2 = above. */
  readable: 0 | 1 | 2;
  rotation: Rotation;
  /** Width of the narrow element in dots. */
  narrow: number;
  /** Width of the wide element in dots. */
  wide: number;
  content: string;
}

/** 2D QR code drawn with the TSPL QRCODE command. */
export interface QrcodeElement {
  kind: 'qrcode';
  x: number;
  y: number;
  /** Error-correction level: L, M, Q, H. */
  ecc: 'L' | 'M' | 'Q' | 'H';
  /** Cell/module width in dots (1-10). */
  cellWidth: number;
  rotation: Rotation;
  content: string;
}

/** A solid filled rectangle drawn with the TSPL BAR command. */
export interface BarElement {
  kind: 'bar';
  x: number;
  y: number;
  /** Width in dots. */
  width: number;
  /** Height in dots. */
  height: number;
}

/** A rectangle outline drawn with the TSPL BOX command. */
export interface BoxElement {
  kind: 'box';
  x: number;
  y: number;
  xEnd: number;
  yEnd: number;
  /** Line thickness in dots. */
  thickness: number;
}

/** A raw TSPL command passed straight through (advanced/escape hatch). */
export interface RawElement {
  kind: 'raw';
  command: string;
}

export type LabelElement =
  | TextElement
  | BarcodeElement
  | QrcodeElement
  | BarElement
  | BoxElement
  | RawElement;

/** A complete label: geometry + the elements to draw + copies. */
export interface LabelSpec {
  geometry: LabelGeometry;
  elements: LabelElement[];
  /** Number of labels to print. */
  quantity: number;
  /** Copies of each label. */
  copies: number;
}
