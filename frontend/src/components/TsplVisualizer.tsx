import { useEffect, useMemo, useRef, useState } from 'react';
import { parseTspl } from '../tspl/parse';
import { renderLabel } from '../tspl/render';

interface Props {
  /** The raw TSPL source to visualise. */
  source: string;
  /** Dots per mm from settings; used as the initial value for the size selector. */
  dpmm: number;
}

const DPMM_OPTIONS = [
  { value: 8, label: '203 dpi (8)' },
  { value: 11.8, label: '300 dpi (11.8)' },
  { value: 24, label: '600 dpi (24)' },
];

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 6;
const ZOOM_STEP = 0.25;

/**
 * Live, approximate preview of a TSPL program drawn on a canvas.
 * Parses SIZE/DIRECTION/TEXT/BARCODE/QRCODE/BAR/BOX and renders element placement.
 * Includes a size (DPMM) selector and zoom controls.
 */
export function TsplVisualizer({ source, dpmm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedDpmm, setSelectedDpmm] = useState<number>(dpmm);
  const [zoom, setZoom] = useState<number>(1);

  // Keep the selector in sync if the settings dpmm changes.
  useEffect(() => {
    setSelectedDpmm(dpmm);
  }, [dpmm]);

  const parsed = useMemo(() => parseTspl(source, selectedDpmm), [source, selectedDpmm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => renderLabel(canvas, parsed, { zoom });
    draw();

    // Redraw when the container's WIDTH changes so the fit-to-width baseline
    // stays correct. We observe the scroll container and only redraw when its
    // width actually changes — resizing the canvas itself (which renderLabel
    // does) must NOT re-trigger a draw, or the ResizeObserver feeds back into an
    // infinite resize loop.
    const target = canvas.parentElement ?? canvas;
    let lastWidth = target.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = target.clientWidth;
      if (w === lastWidth) return; // ignore height-only / self-induced changes
      lastWidth = w;
      // Defer to the next frame so the observer callback returns before we
      // mutate layout (avoids "ResizeObserver loop" warnings).
      window.requestAnimationFrame(draw);
    });
    ro.observe(target);
    return () => ro.disconnect();
  }, [parsed, zoom]);

  const clampZoom = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  const zoomOut = () => setZoom((z) => clampZoom(Math.round((z - ZOOM_STEP) * 100) / 100));
  const zoomIn = () => setZoom((z) => clampZoom(Math.round((z + ZOOM_STEP) * 100) / 100));
  const resetZoom = () => setZoom(1);

  const size = parsed.size;
  const dims = size
    ? `${size.widthDots} × ${size.heightDots} dots` +
      (size.widthMm && size.heightMm ? ` (${size.widthMm} × ${size.heightMm} mm)` : '')
    : 'no SIZE command — using 360 × 600 fallback';

  return (
    <div className="visualizer">
      <div className="visualizer-controls">
        <label className="visualizer-control">
          <span>Size</span>
          <select
            value={String(selectedDpmm)}
            onChange={(e) => setSelectedDpmm(Number(e.target.value))}
            aria-label="Preview resolution (dots per mm)"
          >
            {DPMM_OPTIONS.map((o) => (
              <option key={o.value} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div className="visualizer-zoom" role="group" aria-label="Zoom">
          <button type="button" className="secondary" onClick={zoomOut} disabled={zoom <= ZOOM_MIN} aria-label="Zoom out">
            −
          </button>
          <span className="visualizer-zoom__value">{Math.round(zoom * 100)}%</span>
          <button type="button" className="secondary" onClick={zoomIn} disabled={zoom >= ZOOM_MAX} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="secondary" onClick={resetZoom} disabled={zoom === 1}>
            Fit
          </button>
        </div>
      </div>

      <div className="visualizer-meta">
        <span>{dims}</span>
        <span>·</span>
        <span>{parsed.items.length} element{parsed.items.length === 1 ? '' : 's'}</span>
        {parsed.direction === 1 ? (
          <>
            <span>·</span>
            <span>flipped 180°</span>
          </>
        ) : null}
      </div>

      <div className="visualizer-scroll">
        <canvas ref={canvasRef} className="visualizer-canvas" />
      </div>

      {parsed.unknown.length > 0 ? (
        <details className="visualizer-unknown">
          <summary>{parsed.unknown.length} line(s) not previewed</summary>
          <ul>
            {parsed.unknown.map((u, i) => (
              <li key={i}>
                <code>{u}</code>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="muted visualizer-note">
        Approximate preview. Fonts and barcode encoding won't match the printer;
        placement, size and rotation will.
      </p>
    </div>
  );
}
