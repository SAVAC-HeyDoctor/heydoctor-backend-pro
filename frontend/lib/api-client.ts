/**
 * Llamadas al backend con cookies HttpOnly (access + refresh).
 * No usar Authorization manual ni localStorage para tokens.
 *
 * Opcional: `NEXT_PUBLIC_USE_API_PROXY=1` + rewrites en next.config → base '' (mismo origen).
 */

import { CSRF_HEADER, readCsrfTokenFromDocument } from './csrf';

export function getApiBase(): string {
  if (
    typeof window !== 'undefined' &&
    (window as unknown as { __API_URL__?: string }).__API_URL__
  ) {
    return (window as unknown as { __API_URL__: string }).__API_URL__;
  }
  if (process.env.NEXT_PUBLIC_USE_API_PROXY === '1') {
    return '';
  }
  return process.env.NEXT_PUBLIC_API_URL ?? '';
}

const NON_MUTATING = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

/**
 * fetch con cookies en todas las peticiones.
 * Mutaciones (POST, PUT, PATCH, DELETE): cabecera no simple para endurecer frente a CSRF cross-site.
 */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const isMutation = !NON_MUTATING.has(method);
  const headers = init?.headers
    ? new Headers(init.headers)
    : new Headers();
  if (isMutation) {
    headers.set('X-Requested-With', 'XMLHttpRequest');
    const csrf = readCsrfTokenFromDocument();
    if (csrf) {
      headers.set(CSRF_HEADER, csrf);
    }
  }
  return fetch(input, {
    ...init,
    credentials: 'include',
    headers,
  });
}

export function jsonHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json' };
}
