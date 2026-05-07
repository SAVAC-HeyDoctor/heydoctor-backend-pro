import {
  getGrowthAnonSessionId,
  GrowthTrackEvent,
  trackProductEventPublic,
} from './growth';

const MAX_MESSAGE_LEN = 500;

/** Errores cliente → `product_events` vía endpoint público (sin PII amplia). Solo en browser. */
export async function trackFrontendError(
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  if (typeof window === 'undefined') return;
  const raw = error instanceof Error ? error.message : String(error);
  const message =
    raw.length > MAX_MESSAGE_LEN ? `${raw.slice(0, MAX_MESSAGE_LEN)}…` : raw;
  try {
    await trackProductEventPublic(GrowthTrackEvent.FRONTEND_ERROR, {
      message,
      ...context,
      anonSessionId: getGrowthAnonSessionId(),
    });
  } catch {
    /* no re-lanzar; el tracking no debe romper la UI */
  }
}
