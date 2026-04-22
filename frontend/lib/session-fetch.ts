/**
 * fetch con cookies + reintento tras 401 (refresh) + logout y redirect si la sesión no recupera.
 */

import { apiFetch, getApiBase, jsonHeaders } from './api-client';

let refreshInFlight: Promise<boolean> | null = null;
let sessionRedirectScheduled = false;

function isAuthPath(url: string): boolean {
  return (
    url.includes('/api/auth/login') ||
    url.includes('/api/auth/register') ||
    url.includes('/api/auth/refresh') ||
    url.includes('/api/auth/logout')
  );
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return '';
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

async function logoutAndRedirect(): Promise<void> {
  if (typeof window === 'undefined' || sessionRedirectScheduled) {
    return;
  }
  sessionRedirectScheduled = true;
  try {
    const base = getApiBase();
    await apiFetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({}),
    });
  } catch {
    /* ignorar: sesión ya inválida */
  } finally {
    const qs = new URLSearchParams({ reason: 'session_expired' });
    window.location.replace(`/login?${qs.toString()}`);
  }
}

/**
 * Igual que apiFetch, pero ante 401 intenta refresh y repite la petición una vez.
 * Si el refresh falla → logout + redirect a /login (no usar en rutas /api/auth/* excepto las que ya excluyen retry).
 */
export async function apiFetchWithRefresh(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = resolveUrl(input);
  const skipRetry = isAuthPath(url);

  let res = await apiFetch(input, init);
  if (res.status === 401 && !skipRetry) {
    const refreshed = await refreshSessionOnce();
    if (refreshed) {
      res = await apiFetch(input, init);
    } else {
      void logoutAndRedirect();
    }
  }
  return res;
}
