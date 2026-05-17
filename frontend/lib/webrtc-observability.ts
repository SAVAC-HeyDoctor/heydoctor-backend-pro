import { clientLogger } from './client-logger';
import { getApiBase, jsonHeaders } from './api-client';
import { apiFetchWithRefresh } from './session-fetch';

type WebrtcFailureContext = {
  consultationId?: string | null;
  requestId?: string | null;
  state?: string | null;
  reason?: string | null;
};

export function reportWebrtcFailure(
  event:
    | 'webrtc_ice_failed'
    | 'webrtc_signaling_failed'
    | 'webrtc_reconnect_failed',
  error: unknown,
  context: WebrtcFailureContext = {},
): void {
  clientLogger.error(event, error, {
    consultationId: context.consultationId ?? null,
    requestId: context.requestId ?? null,
    state: context.state ?? null,
    reason: context.reason ?? null,
  });
}

export function reportWebrtcState(
  event:
    | 'webrtc_ice_state'
    | 'webrtc_signaling_state'
    | 'webrtc_connection_state',
  context: WebrtcFailureContext,
): void {
  const state = context.state ?? 'unknown';
  if (state === 'failed' || state === 'disconnected') {
    clientLogger.warn(event, {
      consultationId: context.consultationId ?? null,
      requestId: context.requestId ?? null,
      state,
      reason: context.reason ?? null,
    });
  } else {
    clientLogger.debug(event, {
      consultationId: context.consultationId ?? null,
      requestId: context.requestId ?? null,
      state,
    });
  }
}

export type WebrtcResilienceMetric =
  | 'reconnect_attempts'
  | 'reconnect_success'
  | 'ice_restart_count'
  | 'media_recovery_failures';

type WebrtcResilienceMetricContext = WebrtcFailureContext & {
  count?: number;
};

export async function reportWebrtcResilienceMetric(
  eventType: WebrtcResilienceMetric,
  context: WebrtcResilienceMetricContext,
): Promise<void> {
  clientLogger.info('webrtc_resilience_metric', {
    consultationId: context.consultationId ?? null,
    requestId: context.requestId ?? null,
    eventType,
    count: context.count ?? 1,
    reason: context.reason ?? null,
  });

  if (!context.consultationId) {
    return;
  }

  try {
    await apiFetchWithRefresh(`${getApiBase()}/api/webrtc/metrics`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        consultationId: context.consultationId,
        eventType,
        eventCount: context.count ?? 1,
      }),
    });
  } catch (error) {
    clientLogger.warn('webrtc_resilience_metric_report_failed', {
      consultationId: context.consultationId,
      requestId: context.requestId ?? null,
      eventType,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
}
