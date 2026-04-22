/**
 * Llamadas al backend con cookies HttpOnly (access + refresh).
 * No usar Authorization manual ni localStorage para tokens.
 *
 * Opcional: `NEXT_PUBLIC_USE_API_PROXY=1` + rewrites en next.config → base '' (mismo origen).
 */

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

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: 'include',
    headers: init?.headers,
  });
}

export function jsonHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json' };
}
