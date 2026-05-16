import { clientLogger } from './client-logger';

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
