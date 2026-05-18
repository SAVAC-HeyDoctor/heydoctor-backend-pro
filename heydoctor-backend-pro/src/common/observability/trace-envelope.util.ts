import { getCurrentRequestId } from '../request-context.storage';

/** Clave interna en payloads outbox (no expuesta en admin PHI-safe). */
export const TRACE_ENVELOPE_KEY = '_trace';

export type TraceSource = 'http' | 'webhook' | 'outbox' | 'websocket' | 'cron';

export type TraceEnvelope = {
  requestId: string;
  source: TraceSource;
  enqueuedAt: string;
};

export function attachTraceEnvelope(
  payload: Record<string, unknown>,
  source: TraceSource,
  requestId?: string,
): Record<string, unknown> {
  const existing = payload[TRACE_ENVELOPE_KEY];
  if (
    existing &&
    typeof existing === 'object' &&
    typeof (existing as TraceEnvelope).requestId === 'string'
  ) {
    return payload;
  }
  const id = requestId ?? getCurrentRequestId();
  if (!id) {
    return payload;
  }
  return {
    ...payload,
    [TRACE_ENVELOPE_KEY]: {
      requestId: id,
      source,
      enqueuedAt: new Date().toISOString(),
    } satisfies TraceEnvelope,
  };
}

export function extractTraceRequestId(
  payload: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!payload) return undefined;
  const trace = payload[TRACE_ENVELOPE_KEY];
  if (!trace || typeof trace !== 'object') return undefined;
  const id = (trace as TraceEnvelope).requestId;
  return typeof id === 'string' && id.length >= 8 && id.length <= 128
    ? id
    : undefined;
}

export function extractTraceSource(
  payload: Record<string, unknown> | null | undefined,
): TraceSource | undefined {
  if (!payload) return undefined;
  const trace = payload[TRACE_ENVELOPE_KEY];
  if (!trace || typeof trace !== 'object') return undefined;
  const source = (trace as TraceEnvelope).source;
  if (
    source === 'http' ||
    source === 'webhook' ||
    source === 'outbox' ||
    source === 'websocket' ||
    source === 'cron'
  ) {
    return source;
  }
  return undefined;
}
