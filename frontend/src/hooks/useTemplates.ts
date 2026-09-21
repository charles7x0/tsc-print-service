import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type { StringTemplate } from '../types';

export interface UseTemplates {
  templates: StringTemplate[];
  loading: boolean;
  error?: string;
  /** Re-fetch the list; resolves with the fresh list so callers can react. */
  refresh: () => Promise<StringTemplate[]>;
}

/**
 * Single source of truth for the DB-stored template list.
 *
 * Both the Print and Templates panels consume this hook, so a create/delete in
 * one view is reflected in the other via `refresh()` — the previous
 * per-panel-fetch approach left the Print dropdown stale after edits.
 */
export function useTemplates(): UseTemplates {
  const [templates, setTemplates] = useState<StringTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const refresh = useCallback(async (): Promise<StringTemplate[]> => {
    const list = await api.listTemplates();
    setTemplates(list);
    setError(undefined);
    return list;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh()
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  return { templates, loading, error, refresh };
}
