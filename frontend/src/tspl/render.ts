import type { BarcodeItem, LabelItem, ParsedLabel, TextItem } from './parse';

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

export function renderLabel(canvas: HTMLCanvasElement, label: ParsedLabel): RenderInfo {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { widthDots: 0, heightDots: 0, scale: 1 };

  const widthDots = label.size?.widthDots || FALLBACK_W;
  const heightDots = label.size?.heightDots || FALLBACK_H;

  // Fit the label within the canvas's CSS box, preserving aspect ratio.
  const cssW = canvas.clientWidth || 320;
  const availW = cssW - PADDING * 2;
  const scale = Math.max(0.05, availW / widthDots);

  const cssH = heightDots * scale + PADDING * 2;

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
 * Approximate a TSPL bitmap font. Real font heights vary; we use a base height
 * per font id scaled by the y-multiplier. Good enough to gauge placement.
 */
function baseFontHeight(font: string): number {
  const map: Record<string, number> = {
    '1': 12,
    '2': 16,
    '3': 24,
    '4': 32,
    '5': 40,
    '6': 48,
    '7': 56,
    '8': 64,
    '0': 24, // TrueType default-ish
  };
  return map[font] ?? 24;
}

function drawText(ctx: CanvasRenderingContext2D, item: TextItem) {
  ctx.save();
  applyRotation(ctx, item.x, item.y, item.rotation);

  const px = baseFontHeight(item.font) * Math.max(1, item.yMul);
  ctx.font = `${px}px ui-monospace, Consolas, monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  // Horizontal multiplier widens the glyphs relative to the vertical size.
  const xScale = Math.max(1, item.xMul) / Math.max(1, item.yMul);
  if (xScale !== 1) ctx.scale(xScale, 1);
  ctx.fillStyle = '#111827';
  ctx.fillText(item.content, 0, 0);

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
