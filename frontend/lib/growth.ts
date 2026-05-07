import { apiFetch, getApiBase } from './api-client';
import { apiFetchWithRefresh } from './session-fetch';

export const GrowthTrackEvent = {
  VISIT_MARKETING: 'VISIT_MARKETING',
  VIEW_PRICING_PAGE: 'VIEW_PRICING_PAGE',
  CLICK_UPGRADE_CTA: 'CLICK_UPGRADE_CTA',
  START_CHECKOUT: 'START_CHECKOUT',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  START_CALL: 'START_CALL',
} as const;

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

/** Identificador anónimo estable (embudo antes de login). */
export function getGrowthAnonSessionId(): string {
  if (typeof window === 'undefined') return '';
  const k = 'heyd_growth_anon_v1';
  try {
    let v = window.localStorage.getItem(k);
    if (!v || v.length < 12) {
      v =
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
      window.localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
  }
}

/** Solo flags públicas (usuario anónimo / rollout global). Sin cookies válidas igual responde. */
export async function fetchGrowthContextMaybeAuthed(): Promise<GrowthContextResponse | null> {
  const res = await apiFetch(absPath('/api/growth/context'), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return (await res.json()) as GrowthContextResponse;
}

export async function fetchGrowthContextPublic(): Promise<GrowthContextResponse> {
  return fetchJson<GrowthContextResponse>('/api/growth/context-public');
}

export async function fetchGrowthContextAuthed(): Promise<GrowthContextResponse> {
  return fetchJson<GrowthContextResponse>('/api/growth/context');
}

export async function fetchExperimentPreview(
  experimentKey: string,
  anonId: string,
): Promise<{ variant: string | null }> {
  const q = new URLSearchParams({
    key: experimentKey,
    anonId,
  });
  const res = await apiFetch(absPath(`/api/growth/experiment-preview?${q}`), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`experiment-preview HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as { variant: string | null };
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

/** Eventos permitidos sin sesión ({@link GrowthPublicTrackableEvents} en backend). Requiere `anonSessionId` en props. */
export async function trackProductEventPublic(
  eventName: string,
  properties: Record<string, unknown>,
): Promise<void> {
  const res = await apiFetch(absPath('/api/growth/events-public'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventName, properties }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.warn('[growth] track public failed', res.status, t.slice(0, 160));
  }
}

export async function trackAuthedOrPublic(
  eventName: string,
  baseProps: Record<string, unknown>,
  anonSessionId: string,
): Promise<void> {
  const res = await apiFetch(absPath('/api/growth/events'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventName, properties: baseProps }),
  });
  if (res.ok) return;
  await trackProductEventPublic(eventName, {
    ...baseProps,
    anonSessionId,
  });
}
