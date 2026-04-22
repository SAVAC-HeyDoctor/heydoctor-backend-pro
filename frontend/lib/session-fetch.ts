/**
 * fetch con cookies + reintento tras 401 usando POST /api/auth/refresh (una vez por oleada).
 */

import { apiFetch, getApiBase, jsonHeaders } from './api-client';

let refreshInFlight: Promise<boolean> | null = null;

function isAuthPath(url: string): boolean {
  return url.includes('/api/auth/login') || url.includes('/api/auth/refresh');
}

async function refreshSessionOnce(): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  const base = getApiBase();
  refreshInFlight = (async () => {
    try {
      const res = await apiFetch(`${base}/api/auth/refresh`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

/**
 * Igual que apiFetch, pero ante 401 intenta refresh y repite la petición una vez.
 * No usar para login/refresh (evita bucles).
 */
export async function apiFetchWithRefresh(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : '';
  const skipRetry = isAuthPath(url);

  let res = await apiFetch(input, init);
  if (res.status === 401 && !skipRetry) {
    const refreshed = await refreshSessionOnce();
    if (refreshed) {
      res = await apiFetch(input, init);
    }
  }
  return res;
}
