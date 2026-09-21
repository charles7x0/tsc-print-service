import type {
  BarcodeElement,
  BarElement,
  BoxElement,
  LabelElement,
  LabelGeometry,
  LabelSpec,
  QrcodeElement,
  RawElement,
  Rotation,
  TextElement,
} from './types.js';

/**
 * TSPL commands are terminated with CRLF.
 */
const EOL = '\r\n';

/**
 * Escape a string for safe inclusion inside a TSPL double-quoted argument.
 *
 * TSPL has no rich escape syntax, so this DROPS (does not escape) characters
 * that would break a quoted argument: embedded double quotes and CR/LF are
 * removed, and other control characters are collapsed to a space. The result
 * is safe against command injection but LOSSY — a `"` in the input simply
 * disappears. Callers that must preserve such characters should validate or
 * reject upstream.
 *
 * Note: only glyphs supported by the active CODEPAGE (UTF-8) and the selected
 * font render on the printer. Non-ASCII characters pass through here untouched
 * but may print as blanks/boxes depending on printer and firmware.
 */
export function escapeTsplString(value: string): string {
  return value
    // Remove characters that terminate/confuse a quoted argument.
    .replace(/["\r\n]/g, '')
    // Collapse other control chars.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, ' ');
}

/** A problem found while validating a LabelSpec against its geometry. */
export interface TsplIssue {
  /** Machine-readable code, e.g. "out-of-bounds". */
  code: string;
  /** Human-readable explanation. */
  message: string;
}

/** Thrown when a LabelSpec fails geometry validation (elements off the label). */
export class SpecValidationError extends Error {
  constructor(public readonly issues: TsplIssue[]) {
    super(`Invalid label spec: ${issues.map((i) => i.code).join(', ')}`);
    this.name = 'SpecValidationError';
  }
}

/**
 * Validate that every element in a LabelSpec falls within the printable area
 * (0..widthDots × 0..heightDots), where the dot dimensions are derived from the
 * label geometry (mm) and the printhead resolution (`dpmm`).
 *
 * This catches layout mistakes — an element positioned or sized off the label —
 * BEFORE the program reaches the printer, where they would otherwise clip or
 * print nothing with no error. `raw` elements are not checked (their coordinates
 * are opaque). Returns a list of issues (empty = valid).
 */
export function validateSpec(spec: LabelSpec, dpmm: number): TsplIssue[] {
  const widthDots = mmToDots(spec.geometry.widthMm, dpmm);
  const heightDots = mmToDots(spec.geometry.heightMm, dpmm);
  const issues: TsplIssue[] = [];

  const outX = (x: number): boolean => x < 0 || x > widthDots;
  const outY = (y: number): boolean => y < 0 || y > heightDots;

  spec.elements.forEach((el, i) => {
    const flag = (message: string): void => {
      issues.push({ code: 'out-of-bounds', message: `element[${i}] (${el.kind}): ${message}` });
    };

    switch (el.kind) {
      case 'text':
      case 'barcode':
      case 'qrcode':
        if (outX(el.x) || outY(el.y)) {
          flag(`origin (${el.x},${el.y}) is outside 0..${widthDots} x 0..${heightDots}`);
        }
        if (el.kind === 'barcode' && el.y + el.height > heightDots) {
          flag(`barcode bottom (${el.y + el.height}) exceeds label height ${heightDots}`);
        }
        break;
      case 'bar':
        if (outX(el.x) || outY(el.y) || outX(el.x + el.width) || outY(el.y + el.height)) {
          flag(
            `rectangle (${el.x},${el.y})..(${el.x + el.width},${el.y + el.height}) exceeds ` +
              `${widthDots} x ${heightDots}`,
          );
        }
        break;
      case 'box':
        if (outX(el.x) || outY(el.y) || outX(el.xEnd) || outY(el.yEnd)) {
          flag(
            `box (${el.x},${el.y})..(${el.xEnd},${el.yEnd}) exceeds ${widthDots} x ${heightDots}`,
          );
        }
        break;
      case 'raw':
        // Opaque command — cannot validate coordinates.
        break;
    }
  });

  return issues;
}

function renderText(el: TextElement): string {
  const content = escapeTsplString(el.content);
  return `TEXT ${el.x},${el.y},"${el.font}",${el.rotation},${el.xMultiplier},${el.yMultiplier},"${content}"`;
}

function renderBarcode(el: BarcodeElement): string {
  const content = escapeTsplString(el.content);
  return `BARCODE ${el.x},${el.y},"${el.type}",${el.height},${el.readable},${el.rotation},${el.narrow},${el.wide},"${content}"`;
}

function renderQrcode(el: QrcodeElement): string {
  const content = escapeTsplString(el.content);
  // QRCODE x,y,ECC,cell,mode,rotation,"content" (mode A = auto).
  return `QRCODE ${el.x},${el.y},${el.ecc},${el.cellWidth},A,${el.rotation},"${content}"`;
}

function renderBar(el: BarElement): string {
  return `BAR ${el.x},${el.y},${el.width},${el.height}`;
}

function renderBox(el: BoxElement): string {
  return `BOX ${el.x},${el.y},${el.xEnd},${el.yEnd},${el.thickness}`;
}

/**
 * Emit a `raw` element's command VERBATIM (only trimmed). This is a deliberate
 * escape hatch: unlike text/barcode content, raw commands are NOT escaped, so a
 * raw element can inject arbitrary TSPL. It is the caller's trust boundary —
 * never wire untrusted input into a RawElement / the /api/print/raw path.
 */
function renderRaw(el: RawElement): string {
  return el.command.trim();
}

function renderElement(el: LabelElement): string {
  switch (el.kind) {
    case 'text':
      return renderText(el);
    case 'barcode':
      return renderBarcode(el);
    case 'qrcode':
      return renderQrcode(el);
    case 'bar':
      return renderBar(el);
    case 'box':
      return renderBox(el);
    case 'raw':
      return renderRaw(el);
    default: {
      // Exhaustiveness check: if a new element kind is added, this fails to compile.
      const _never: never = el;
      throw new Error(`Unknown element kind: ${JSON.stringify(_never)}`);
    }
  }
}

/**
 * Build the full TSPL program for a label specification.
 *
 * Emits geometry (SIZE/GAP/DIRECTION), clears the buffer (CLS), sets the
 * codepage to UTF-8, renders every element, then issues PRINT.
 *
 * Scope: this builder targets millimetre, gap-sensor stock only (it always
 * emits `SIZE ... mm` and `GAP ... mm,0 mm`). For black-mark (BLINE) stock,
 * inch units, or any other command layout, author a DB string template instead
 * — those emit their own raw SIZE/GAP/BLINE lines.
 */
export function buildLabel(spec: LabelSpec, overrides: { copies?: number } = {}): string {
  const { geometry, elements, quantity } = spec;
  const copies = overrides.copies ?? spec.copies;

  const lines: string[] = [];

  lines.push(`SIZE ${geometry.widthMm} mm,${geometry.heightMm} mm`);
  lines.push(`GAP ${geometry.gapMm} mm,0 mm`);
  lines.push(`DIRECTION ${geometry.direction},${geometry.mirror}`);
  if (geometry.reference) {
    lines.push(`REFERENCE ${geometry.reference.x},${geometry.reference.y}`);
  }
  lines.push('CLS');
  lines.push('CODEPAGE UTF-8');

  for (const el of elements) {
    lines.push(renderElement(el));
  }

  lines.push(`PRINT ${quantity},${copies}`);

  return lines.join(EOL) + EOL;
}

/**
 * Build a bare TSPL program from a list of already-formed command lines.
 * Useful for the "send raw commands" API path. Ensures CRLF termination.
 */
export function buildRawProgram(commands: string[]): string {
  return commands.map((c) => c.trim()).filter(Boolean).join(EOL) + EOL;
}

/** Convert millimetres to dots for a given printhead resolution. */
export function mmToDots(mm: number, dotsPerMm: number): number {
  return Math.round(mm * dotsPerMm);
}

// ---------------------------------------------------------------------------
// Built-in demo/test label (the only code-built layout). Positions are computed
// from the label geometry + DPI so it fits any stock, consistent with the
// geometry-drives-layout principle.
// ---------------------------------------------------------------------------

/** Options for the built-in demo/test label. */
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

interface TestTexts {
  fontText: string;
  barcodeData: string;
  windowsText: string;
  inlineText: string;
}

/**
 * Build the demo/test label.
 *
 *  - Portrait: rows stack down the label; `x` is a shared left margin.
 *  - Landscape: rotation = 90; content reads across the long edge, so `y` is
 *    the shared cross-margin and `x` steps along the label length.
 */
export function buildTestLabelSpec(opts: TestLabelOptions): LabelSpec {
  const W = mmToDots(opts.geometry.widthMm, opts.dpmm);
  const H = mmToDots(opts.geometry.heightMm, opts.dpmm);
  const margin = Math.round(Math.min(W, H) * 0.08);

  const texts: TestTexts = {
    fontText: opts.fontText ?? 'Font Test',
    barcodeData: opts.barcodeData ?? '123456',
    windowsText: opts.windowsText ?? 'Windowsfont Test',
    inlineText: opts.inlineText ?? 'Text Test!!',
  };

  const elements: LabelElement[] = opts.landscape
    ? buildLandscapeTest(W, margin, texts)
    : buildPortraitTest(H, margin, texts);

  return { geometry: opts.geometry, elements, quantity: 1, copies: 1 };
}

/** Portrait: four rows stacked down the label height. */
function buildPortraitTest(H: number, margin: number, t: TestTexts): LabelElement[] {
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
function buildLandscapeTest(W: number, margin: number, t: TestTexts): LabelElement[] {
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
