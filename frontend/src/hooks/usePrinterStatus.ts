import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { Settings } from '../lib/types';

/**
 * Live printer reachability, distinct from the dry-run/live *mode*.
 *
 * - Dry-run mode never probes hardware (nothing is sent to a printer).
 * - Live mode probes `POST /api/test-connection` (a non-destructive TCP probe)
 *   on mount, on an interval, when the tab regains focus, and on demand.
 *
 * A slow/offline printer must not hammer the network, so the interval backs off
 * after repeated failures and returns to normal once reachable again.
 */

export type Reachability = 'unknown' | 'checking' | 'reachable' | 'unreachable';

export interface PrinterStatus {
  reachability: Reachability;
  /** TCP round-trip in ms when reachable. */
  latencyMs?: number;
  /** Failure reason when unreachable. */
  error?: string;
  /** Epoch ms of the last completed probe. */
  checkedAt?: number;
  /** Trigger an immediate re-probe (e.g. a "Test now" button). */
  refresh: () => void;
}

const OK_INTERVAL_MS = 10_000;
const MAX_INTERVAL_MS = 60_000;

export function usePrinterStatus(settings: Settings | null): PrinterStatus {
  const dryRun = settings?.printer.dryRun ?? true;

  const [reachability, setReachability] = useState<Reachability>('unknown');
  const [latencyMs, setLatencyMs] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [checkedAt, setCheckedAt] = useState<number | undefined>(undefined);

  // Consecutive failures drive the backoff; kept in a ref so it doesn't
  // re-trigger effects.
  const failuresRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  // Guards against setting state after unmount / stale async resolves.
  const activeRef = useRef(true);

  const probe = useCallback(async () => {
    if (dryRun) return;
    setReachability((r) => (r === 'unknown' ? 'checking' : r));
    try {
      const result = await api.testConnection({});
      if (!activeRef.current) return;
      setCheckedAt(Date.now());
      if (result.reachable) {
        failuresRef.current = 0;
        setReachability('reachable');
        setLatencyMs(result.latencyMs);
        setError(undefined);
      } else {
        failuresRef.current += 1;
        setReachability('unreachable');
        setLatencyMs(undefined);
        setError(result.error);
      }
    } catch (err) {
      if (!activeRef.current) return;
      failuresRef.current += 1;
      setReachability('unreachable');
      setLatencyMs(undefined);
      setError(err instanceof ApiError ? err.message : String(err));
      setCheckedAt(Date.now());
    }
  }, [dryRun]);

  const refresh = useCallback(() => {
    failuresRef.current = 0;
    void probe();
  }, [probe]);

  // Schedule polling with exponential backoff on failures.
  useEffect(() => {
    activeRef.current = true;

    if (dryRun) {
      setReachability('unknown');
      setError(undefined);
      setLatencyMs(undefined);
      return () => {
        activeRef.current = false;
      };
    }

    const tick = async () => {
      await probe();
      if (!activeRef.current) return;
      const delay = Math.min(
        MAX_INTERVAL_MS,
        OK_INTERVAL_MS * Math.pow(2, failuresRef.current),
      );
      timerRef.current = window.setTimeout(tick, delay);
    };

    void tick();

    return () => {
      activeRef.current = false;
      window.clearTimeout(timerRef.current);
    };
  }, [dryRun, probe]);

  // Re-probe immediately when the tab regains focus/visibility.
  useEffect(() => {
    if (dryRun) return;
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [dryRun, refresh]);

  return { reachability, latencyMs, error, checkedAt, refresh };
}
