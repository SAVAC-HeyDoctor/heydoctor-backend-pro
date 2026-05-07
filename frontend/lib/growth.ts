import { getApiBase } from './api-client';
import { apiFetchWithRefresh } from './session-fetch';

export type GrowthContextResponse = {
  features: Record<string, boolean>;
  experiments: Record<string, string | null>;
  userId: string | null;
};

function absPath(path: string): string {
  return `${getApiBase()}${path}`;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetchWithRefresh(absPath(path), {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${path} HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Solo flags públicas (usuario anónimo / rollout global). Sin cookies. */
export async function fetchGrowthContextPublic(): Promise<GrowthContextResponse> {
  return fetchJson<GrowthContextResponse>('/api/growth/context-public');
}

export async function fetchGrowthContextAuthed(): Promise<GrowthContextResponse> {
  return fetchJson<GrowthContextResponse>('/api/growth/context');
}

/** Evento analítico de producto (requiere sesión). */
export async function trackProductEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  const res = await apiFetchWithRefresh(absPath('/api/growth/events'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventName, properties: properties ?? {} }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.warn('[growth] track failed', res.status, t.slice(0, 160));
  }
}
