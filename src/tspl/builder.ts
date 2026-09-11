import type {
  BarcodeElement,
  BarElement,
  BoxElement,
  LabelElement,
  LabelSpec,
  QrcodeElement,
  RawElement,
  TextElement,
} from './types.js';

/**
 * TSPL commands are terminated with CRLF.
 */
const EOL = '\r\n';

/**
 * Escape a string for safe inclusion inside a TSPL double-quoted argument.
 * TSPL does not have a rich escape syntax; the practical rules are to strip
 * embedded double quotes and control characters that would break parsing.
 */
export function escapeTsplString(value: string): string {
  return value
    // Remove characters that terminate/confuse a quoted argument.
    .replace(/["\r\n]/g, '')
    // Collapse other control chars.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, ' ');
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
 */
export function buildLabel(spec: LabelSpec): string {
  const { geometry, elements, quantity, copies } = spec;

  const lines: string[] = [];

  lines.push(`SIZE ${geometry.widthMm} mm,${geometry.heightMm} mm`);
  lines.push(`GAP ${geometry.gapMm} mm,0 mm`);
  lines.push(`DIRECTION ${geometry.direction},${geometry.mirror}`);
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
