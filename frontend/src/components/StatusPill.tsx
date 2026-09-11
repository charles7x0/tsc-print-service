import type { Settings } from '../types';

export type ConnectionState = 'connecting' | 'dry-run' | 'live' | 'error';

interface StatusPillProps {
  state: ConnectionState;
  settings: Settings | null;
  message?: string;
}

const LABELS: Record<ConnectionState, string> = {
  connecting: 'Connecting',
  'dry-run': 'Dry run',
  live: 'Live device',
  error: 'Disconnected',
};

/**
 * A compact connection indicator with a coloured dot. Communicates the printer
 * mode at a glance — important for an operator deciding whether output is real.
 */
export function StatusPill({ state, settings, message }: StatusPillProps): JSX.Element {
  const detail =
    state === 'live' && settings
      ? `${settings.printer.ip}:${settings.printer.port}`
      : state === 'dry-run'
        ? 'TSPL downloaded to browser'
        : message ?? '';

  return (
    <div className={`status-pill status-pill--${state}`} role="status" aria-live="polite">
      <span className="status-pill__dot" aria-hidden="true" />
      <span className="status-pill__label">{LABELS[state]}</span>
      {detail ? <span className="status-pill__detail">{detail}</span> : null}
    </div>
  );
}
