'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clientLogger } from '../lib/client-logger';

export type ApiQueryState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

/**
 * Patrón consistente: loading / error / retry para llamadas async en montaje.
 * `fetcher` puede ser inline: se usa la última versión vía ref (evita loops).
 */
export function useApiQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { enabled?: boolean },
): ApiQueryState<T> {
  const enabled = options?.enabled !== false;
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcherRef
      .current()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : 'Error desconocido';
        if (!cancelled) {
          setError(msg);
          setData(null);
        }
        clientLogger.error('useApiQuery_failed', e, { key });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, tick, enabled]);

  return { data, loading, error, refetch };
}
