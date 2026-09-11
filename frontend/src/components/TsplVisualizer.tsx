import { useEffect, useMemo, useRef } from 'react';
import { parseTspl } from '../tspl/parse';
import { renderLabel } from '../tspl/render';

interface Props {
  /** The raw TSPL source to visualise. */
  source: string;
  /** Dots per mm, used to convert a mm-based SIZE into dots. */
  dpmm: number;
}

/**
 * Live, approximate preview of a TSPL program drawn on a canvas.
 * Parses SIZE/DIRECTION/TEXT/BARCODE/BAR/BOX and renders element placement.
 */
export function TsplVisualizer({ source, dpmm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const parsed = useMemo(() => parseTspl(source, dpmm), [source, dpmm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => renderLabel(canvas, parsed);
    draw();

    // Redraw on container resize so the preview stays fitted.
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [parsed]);

  const size = parsed.size;
  const dims = size
    ? `${size.widthDots} × ${size.heightDots} dots` +
      (size.widthMm && size.heightMm ? ` (${size.widthMm} × ${size.heightMm} mm)` : '')
    : 'no SIZE command — using 360 × 600 fallback';

  return (
    <div className="visualizer">
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
      <canvas ref={canvasRef} className="visualizer-canvas" />
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
