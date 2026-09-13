import type { BarcodeItem, DmatrixItem, LabelItem, ParsedLabel, QrcodeItem, TextItem } from './parse';

/**
 * Render an approximate preview of a parsed TSPL label onto a canvas.
 *
 * Coordinates are in dots. We scale dots -> CSS pixels to fit the canvas while
 * preserving aspect ratio. Rotation matches TSPL (clockwise, anchored at the
 * element's x,y origin).
 */

const PADDING = 16; // px around the label inside the canvas
const FALLBACK_W = 360;
const FALLBACK_H = 600;

export interface RenderInfo {
  widthDots: number;
  heightDots: number;
  scale: number;
}

export interface RenderOptions {
  /** Zoom multiplier applied on top of the fit-to-width scale (1 = fit). */
  zoom?: number;
}

export function renderLabel(
  canvas: HTMLCanvasElement,
  label: ParsedLabel,
  options: RenderOptions = {},
): RenderInfo {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { widthDots: 0, heightDots: 0, scale: 1 };

  const zoom = Math.max(0.1, options.zoom ?? 1);

  const widthDots = label.size?.widthDots || FALLBACK_W;
  const heightDots = label.size?.heightDots || FALLBACK_H;

  // Fit the label to the container width at zoom = 1, then apply the zoom on top.
  // The canvas is measured from its parent so zooming can grow it wider than the
  // viewport (the parent provides horizontal scroll).
  const containerW = canvas.parentElement?.clientWidth || canvas.clientWidth || 320;
  const availW = containerW - PADDING * 2;
  const fitScale = Math.max(0.05, availW / widthDots);
  const scale = fitScale * zoom;

  const cssW = widthDots * scale + PADDING * 2;
  const cssH = heightDots * scale + PADDING * 2;
  canvas.style.width = `${cssW}px`;

  // Handle high-DPI displays crisply.
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.height = `${cssH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background.
  ctx.clearRect(0, 0, cssW, cssH);

  // Label paper.
  const originX = PADDING;
  const originY = PADDING;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.fillRect(originX, originY, widthDots * scale, heightDots * scale);
  ctx.strokeRect(originX, originY, widthDots * scale, heightDots * scale);

  // Everything drawn in "dot space" translated/scaled into the paper.
  ctx.save();
  ctx.translate(originX, originY);
  ctx.scale(scale, scale);

  ctx.fillStyle = '#111827';
  ctx.strokeStyle = '#111827';

  for (const item of label.items) {
    drawItem(ctx, item);
  }

  ctx.restore();

  return { widthDots, heightDots, scale };
}

function applyRotation(ctx: CanvasRenderingContext2D, x: number, y: number, rotation: number) {
  ctx.translate(x, y);
  // TSPL rotation is clockwise; canvas rotate() is clockwise for positive radians.
  ctx.rotate((rotation * Math.PI) / 180);
}

function drawItem(ctx: CanvasRenderingContext2D, item: LabelItem) {
  switch (item.kind) {
    case 'text':
      drawText(ctx, item);
      break;
    case 'barcode':
      drawBarcode(ctx, item);
      break;
    case 'qrcode':
      drawQrcode(ctx, item);
      break;
    case 'dmatrix':
      drawDmatrix(ctx, item);
      break;
    case 'bar':
      ctx.fillRect(item.x, item.y, item.width, item.height);
      break;
    case 'box':
      ctx.lineWidth = item.thickness || 1;
      ctx.strokeRect(item.x, item.y, item.xEnd - item.x, item.yEnd - item.y);
      break;
  }
}

/**
 * TSPL built-in bitmap fonts have fixed cell dimensions in dots (width x height):
 *   1: 8x12   2: 12x20   3: 16x24   4: 24x32   5: 32x48
 *   6: 14x19 (OCR-B)     7: 21x27 (OCR-B)      8: 14x25 (OCR-A)
 * Using the real cell size (not guessed values) makes preview proportions match
 * the printed label. Font "0"/TTF is scalable; approximate at 24x24.
 */
const FONT_CELL: Record<string, { w: number; h: number }> = {
  '1': { w: 8, h: 12 },
  '2': { w: 12, h: 20 },
  '3': { w: 16, h: 24 },
  '4': { w: 24, h: 32 },
  '5': { w: 32, h: 48 },
  '6': { w: 14, h: 19 },
  '7': { w: 21, h: 27 },
  '8': { w: 14, h: 25 },
  '0': { w: 12, h: 24 },
};

function fontCell(font: string): { w: number; h: number } {
  return FONT_CELL[font] ?? { w: 16, h: 24 };
}

function drawText(ctx: CanvasRenderingContext2D, item: TextItem) {
  ctx.save();
  applyRotation(ctx, item.x, item.y, item.rotation);

  const cell = fontCell(item.font);
  const yMul = Math.max(1, item.yMul);
  const xMul = Math.max(1, item.xMul);

  // Total glyph cell size in dots, matching TSPL's fixed-pitch fonts.
  const cellH = cell.h * yMul;
  const cellW = cell.w * xMul;

  // Draw each character into its fixed cell so the string occupies exactly
  // (chars * cellW) dots — matching the printer's fixed-pitch advance so the
  // preview's text length lines up with the real label.
  const glyphPx = cellH * 0.92; // slight inset so glyphs sit within the cell
  ctx.font = `${glyphPx}px ui-monospace, Consolas, monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#111827';

  const chars = item.content.split('');
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], i * cellW + cellW / 2, 0);
  }

  ctx.restore();
}

function drawBarcode(ctx: CanvasRenderingContext2D, item: BarcodeItem) {
  ctx.save();
  applyRotation(ctx, item.x, item.y, item.rotation);

  // Approximate bars from the content: deterministic pseudo-random widths so
  // the same data always renders the same. Not a real symbology.
  const height = item.height;
  const narrow = Math.max(1, item.narrow);
  const wide = Math.max(narrow, item.wide || narrow * 2);
  let x = 0;
  ctx.fillStyle = '#111827';

  const chars = (item.content || '0').split('');
  for (let i = 0; i < chars.length * 3 + 6; i++) {
    const code = (chars[i % chars.length]?.charCodeAt(0) ?? 48) + i;
    const isBar = (code + i) % 2 === 0;
    const w = code % 3 === 0 ? wide : narrow;
    if (isBar) {
      ctx.fillRect(x, 0, w, height);
    }
    x += w + narrow;
  }

  // Human-readable text.
  if (item.readable === 1) {
    ctx.font = '18px ui-monospace, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(item.content, 0, height + 2);
  } else if (item.readable === 2) {
    ctx.font = '18px ui-monospace, Consolas, monospace';
    ctx.textBaseline = 'bottom';
    ctx.fillText(item.content, 0, -2);
  }

  ctx.restore();
}

/**
 * Draw a QR code placeholder. This is NOT a real QR encoder — it renders a
 * finder-pattern-style square that occupies the SAME footprint the printer will
 * use, so the preview reveals collisions with nearby elements. The footprint is
 * approximated as ~25 modules wide (a common QR version), each `cellWidth` dots.
 */
/**
 * Approximate the QR module count (side length) from the payload length.
 * Real QR versions grow with data: v1=21, v2=25, v3=29, ... (+4 per version).
 * This matches the printer far better than a fixed 25 for short payloads, so
 * the preview footprint tracks the real symbol size.
 */
function estimateQrModules(content: string): number {
  const len = content.length;
  // Rough alphanumeric capacities at ECC M per version (1..6).
  const version =
    len <= 20 ? 1 : len <= 38 ? 2 : len <= 61 ? 3 : len <= 90 ? 4 : len <= 122 ? 5 : 6;
  return 21 + (version - 1) * 4;
}

function drawQrcode(ctx: CanvasRenderingContext2D, item: QrcodeItem) {
  ctx.save();
  applyRotation(ctx, item.x, item.y, item.rotation);

  const cell = Math.max(1, item.cellWidth);
  const modules = estimateQrModules(item.content); // footprint tracks payload size
  const size = cell * modules;

  ctx.fillStyle = '#111827';
  // Outer quiet-zone border so the block reads as a QR code.
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, size, size);

  // Three finder patterns (corners).
  const finder = cell * 7;
  const drawFinder = (fx: number, fy: number) => {
    ctx.fillRect(fx, fy, finder, finder);
    ctx.clearRect(fx + cell, fy + cell, finder - 2 * cell, finder - 2 * cell);
    ctx.fillRect(fx + 2 * cell, fy + 2 * cell, finder - 4 * cell, finder - 4 * cell);
  };
  drawFinder(0, 0);
  drawFinder(size - finder, 0);
  drawFinder(0, size - finder);

  // Sparse module fill in the data area so it visually reads as a QR.
  const chars = (item.content || '0').split('');
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      // Skip the finder regions.
      const inFinder =
        (r < 8 && c < 8) || (r < 8 && c >= modules - 8) || (r >= modules - 8 && c < 8);
      if (inFinder) continue;
      const code = chars[(r * modules + c) % Math.max(1, chars.length)]?.charCodeAt(0) ?? 0;
      if ((code + r * 3 + c * 7) % 2 === 0) {
        ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }
  }

  ctx.restore();
}

/**
 * Draw a DataMatrix placeholder. Like the QR placeholder, this is NOT a real
 * encoder — it renders a symbol with DataMatrix's characteristic "L" solid
 * finder (left + bottom edges) and a dashed timing pattern (top + right edges),
 * plus a pseudo-random data fill. It occupies the same width x height footprint
 * the printer will use, so the preview reveals size and collisions.
 */
function drawDmatrix(ctx: CanvasRenderingContext2D, item: DmatrixItem) {
  ctx.save();

  const area = Math.max(1, Math.min(item.width, item.height));
  // Approximate module count from the payload (even, 10..32 is typical).
  const dataLen = (item.content || '0').length;
  const modules = Math.min(32, Math.max(10, Math.ceil(Math.sqrt(dataLen) + 8) * 2 - 2));
  const cell = area / modules;

  ctx.fillStyle = '#111827';

  // Solid "L" finder: full left column and full bottom row.
  ctx.fillRect(item.x, item.y, cell, area); // left edge
  ctx.fillRect(item.x, item.y + area - cell, area, cell); // bottom edge

  // Dashed timing pattern: top row and right column (alternating modules).
  for (let i = 0; i < modules; i++) {
    if (i % 2 === 0) {
      ctx.fillRect(item.x + i * cell, item.y, cell, cell); // top edge
      ctx.fillRect(item.x + area - cell, item.y + i * cell, cell, cell); // right edge
    }
  }

  // Pseudo-random data fill inside, deterministic per content.
  const chars = (item.content || '0').split('');
  for (let r = 1; r < modules - 1; r++) {
    for (let c = 1; c < modules - 1; c++) {
      const code = chars[(r * modules + c) % Math.max(1, chars.length)]?.charCodeAt(0) ?? 0;
      if ((code + r * 5 + c * 3) % 2 === 0) {
        ctx.fillRect(item.x + c * cell, item.y + r * cell, cell, cell);
      }
    }
  }

  ctx.restore();
}
