/**
 * A small, forgiving TSPL parser for the label PREVIEW.
 *
 * This is NOT a printer emulator: it understands enough of the common commands
 * to visualise element placement, rotation and size. Fonts and exact barcode
 * encodings are approximated.
 */

export type Rotation = 0 | 90 | 180 | 270;

export interface LabelSize {
  /** Width in dots. */
  widthDots: number;
  /** Height in dots. */
  heightDots: number;
  /** Raw values as parsed, for display. */
  widthMm?: number;
  heightMm?: number;
}

export interface TextItem {
  kind: 'text';
  x: number;
  y: number;
  font: string;
  rotation: Rotation;
  xMul: number;
  yMul: number;
  content: string;
}

export interface BarcodeItem {
  kind: 'barcode';
  x: number;
  y: number;
  type: string;
  height: number;
  readable: 0 | 1 | 2;
  rotation: Rotation;
  narrow: number;
  wide: number;
  content: string;
}

export interface QrcodeItem {
  kind: 'qrcode';
  x: number;
  y: number;
  /** Cell/module width in dots. */
  cellWidth: number;
  rotation: Rotation;
  content: string;
}

export interface DmatrixItem {
  kind: 'dmatrix';
  x: number;
  y: number;
  /** Expected width of the barcode area in dots. */
  width: number;
  /** Expected height of the barcode area in dots. */
  height: number;
  content: string;
}

export interface BoxItem {
  kind: 'box';
  x: number;
  y: number;
  xEnd: number;
  yEnd: number;
  thickness: number;
}

export interface BarItem {
  kind: 'bar';
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LabelItem = TextItem | BarcodeItem | QrcodeItem | DmatrixItem | BoxItem | BarItem;

export interface ParsedLabel {
  size: LabelSize | null;
  direction: 0 | 1;
  mirror: 0 | 1;
  items: LabelItem[];
  /** Lines that were not understood (shown as hints, not errors). */
  unknown: string[];
}

const DEFAULT_DPMM = 8;

function toRotation(v: number): Rotation {
  if (v === 90 || v === 180 || v === 270) return v;
  return 0;
}

/**
 * Parse a "SIZE" value that may be "45 mm", "45mm", "360 dot", or a bare number
 * (interpreted as mm, TSPL's default unit). Returns dots.
 */
function sizeValueToDots(raw: string, dpmm: number): { dots: number; mm?: number } {
  const s = raw.trim().toLowerCase();
  const numMatch = s.match(/[-+]?\d*\.?\d+/);
  if (!numMatch) return { dots: 0 };
  const n = parseFloat(numMatch[0]);
  if (s.includes('dot')) {
    return { dots: Math.round(n) };
  }
  // mm (explicit or default)
  return { dots: Math.round(n * dpmm), mm: n };
}

/**
 * Split a TSPL argument list on commas, respecting double-quoted strings so a
 * comma inside "..." is not treated as a separator.
 */
function splitArgs(argStr: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < argStr.length; i++) {
    const ch = argStr[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      cur += ch;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((a) => a.trim());
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    return t.slice(1, -1);
  }
  return t;
}

function num(s: string | undefined, fallback = 0): number {
  if (s === undefined) return fallback;
  const n = parseFloat(s.replace(/[^-+\d.]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Parse a full TSPL program into a structured label description.
 * `dpmm` is used to convert mm-based SIZE into dots.
 */
export function parseTspl(source: string, dpmm: number = DEFAULT_DPMM): ParsedLabel {
  const result: ParsedLabel = {
    size: null,
    direction: 0,
    mirror: 0,
    items: [],
    unknown: [],
  };

  const lines = source.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const spaceIdx = line.indexOf(' ');
    const command = (spaceIdx === -1 ? line : line.slice(0, spaceIdx)).toUpperCase();
    const rest = spaceIdx === -1 ? '' : line.slice(spaceIdx + 1);

    switch (command) {
      case 'SIZE': {
        const parts = splitArgs(rest);
        const w = sizeValueToDots(parts[0] ?? '', dpmm);
        const h = sizeValueToDots(parts[1] ?? '', dpmm);
        result.size = {
          widthDots: w.dots,
          heightDots: h.dots,
          widthMm: w.mm,
          heightMm: h.mm,
        };
        break;
      }
      case 'DIRECTION': {
        const parts = splitArgs(rest);
        result.direction = num(parts[0]) === 1 ? 1 : 0;
        result.mirror = num(parts[1]) === 1 ? 1 : 0;
        break;
      }
      case 'CLS':
        result.items = [];
        break;
      case 'TEXT': {
        const a = splitArgs(rest);
        // TEXT x,y,"font",rotation,x-mul,y-mul,"content"
        result.items.push({
          kind: 'text',
          x: num(a[0]),
          y: num(a[1]),
          font: unquote(a[2] ?? '"0"'),
          rotation: toRotation(num(a[3])),
          xMul: num(a[4], 1),
          yMul: num(a[5], 1),
          content: unquote(a[6] ?? '""'),
        });
        break;
      }
      case 'BARCODE': {
        const a = splitArgs(rest);
        // BARCODE x,y,"type",height,readable,rotation,narrow,wide,"content"
        result.items.push({
          kind: 'barcode',
          x: num(a[0]),
          y: num(a[1]),
          type: unquote(a[2] ?? '"128"'),
          height: num(a[3], 50),
          readable: (num(a[4]) === 1 ? 1 : num(a[4]) === 2 ? 2 : 0) as 0 | 1 | 2,
          rotation: toRotation(num(a[5])),
          narrow: num(a[6], 2),
          wide: num(a[7], 2),
          content: unquote(a[8] ?? '""'),
        });
        break;
      }
      case 'QRCODE': {
        const a = splitArgs(rest);
        // QRCODE x,y,ECC,cell,mode,rotation,[model,mask,]"content"
        // The content is always the last argument; cell width is arg index 3.
        const content = unquote(a[a.length - 1] ?? '""');
        result.items.push({
          kind: 'qrcode',
          x: num(a[0]),
          y: num(a[1]),
          cellWidth: num(a[3], 4),
          rotation: toRotation(num(a[5])),
          content,
        });
        break;
      }
      case 'DMATRIX': {
        const a = splitArgs(rest);
        // DMATRIX x,y,width,height,[options,]"content"
        // Content is always the last argument.
        const content = unquote(a[a.length - 1] ?? '""');
        result.items.push({
          kind: 'dmatrix',
          x: num(a[0]),
          y: num(a[1]),
          width: num(a[2], 100),
          height: num(a[3], 100),
          content,
        });
        break;
      }
      case 'BAR': {
        const a = splitArgs(rest);
        // BAR x,y,width,height
        result.items.push({
          kind: 'bar',
          x: num(a[0]),
          y: num(a[1]),
          width: num(a[2]),
          height: num(a[3]),
        });
        break;
      }
      case 'BOX': {
        const a = splitArgs(rest);
        // BOX x_start,y_start,x_end,y_end,thickness
        result.items.push({
          kind: 'box',
          x: num(a[0]),
          y: num(a[1]),
          xEnd: num(a[2]),
          yEnd: num(a[3]),
          thickness: num(a[4], 1),
        });
        break;
      }
      case 'GAP':
      case 'CODEPAGE':
      case 'PRINT':
      case 'DENSITY':
      case 'SPEED':
      case 'REFERENCE':
      case 'OFFSET':
      case 'CLEAR':
        // Recognised but not visualised.
        break;
      default:
        result.unknown.push(line);
        break;
    }
  }

  return result;
}
