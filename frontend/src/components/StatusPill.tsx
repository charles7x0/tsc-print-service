import type { Settings } from '../lib/types';
import type { Reachability } from '../hooks/usePrinterStatus';

export type ConnectionState = 'connecting' | 'dry-run' | 'live' | 'error';

interface StatusPillProps {
  state: ConnectionState;
  settings: Settings | null;
  message?: string;
  /** Live reachability (only meaningful in live mode). */
  reachability?: Reachability;
  latencyMs?: number;
  reachError?: string;
  checkedAt?: number;
  /** On-demand re-probe. */
  onRefresh?: () => void;
}

const LABELS: Record<ConnectionState, string> = {
  connecting: 'Connecting',
  'dry-run': 'Dry run',
  live: 'Live device',
  error: 'Disconnected',
};

/** "3s ago" style relative time for the last reachability check. */
function agoText(checkedAt?: number): string {
  if (!checkedAt) return '';
  const secs = Math.max(0, Math.round((Date.now() - checkedAt) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  return `${mins}m ago`;
}

/**
 * Compact connection indicator. In live mode it reflects ACTUAL reachability
 * (polled), not just the configured mode — so an offline printer shows as
 * unreachable rather than a misleading "Live device".
 */
export function StatusPill({
  state,
  settings,
  message,
  reachability,
  latencyMs,
  reachError,
  checkedAt,
  onRefresh,
}: StatusPillProps): JSX.Element {
  // In live mode, the pill's colour/label follow reachability.
  const isLive = state === 'live';
  const effectiveState: string =
    isLive && reachability === 'unreachable'
      ? 'unreachable'
      : isLive && reachability === 'reachable'
        ? 'reachable'
        : isLive && reachability === 'checking'
          ? 'checking'
          : state;

  const label =
    effectiveState === 'reachable'
      ? 'Live · reachable'
      : effectiveState === 'unreachable'
        ? 'Live · unreachable'
        : effectiveState === 'checking'
          ? 'Live · checking…'
          : LABELS[state];

  let detail = '';
  if (isLive && settings) {
    const target = `${settings.printer.ip}:${settings.printer.port}`;
    if (reachability === 'reachable') {
      detail = `${target} · ${latencyMs ?? '?'}ms · ${agoText(checkedAt)}`;
    } else if (reachability === 'unreachable') {
      detail = `${target} · ${reachError ?? 'no response'}`;
    } else {
      detail = target;
    }
  } else if (state === 'dry-run') {
    detail = 'TSPL downloaded to browser';
  } else {
    detail = message ?? '';
  }

  return (
    <div
      className={`status-pill status-pill--${effectiveState}`}
      role="status"
      aria-live="polite"
    >
      <span className="status-pill__dot" aria-hidden="true" />
      <span className="status-pill__label">{label}</span>
      {detail ? <span className="status-pill__detail">{detail}</span> : null}
      {isLive && onRefresh ? (
        <button
          type="button"
          className="status-pill__refresh"
          onClick={onRefresh}
          aria-label="Test printer connection now"
        >
          Test now
        </button>
      ) : null}
    </div>
  );
}
