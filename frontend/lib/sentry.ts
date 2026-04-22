/**
 * Observabilidad: @sentry/nextjs cuando hay DSN; sin DSN, no-op (build y runtime sin credenciales).
 * Solo uso en cliente (client-logger / boundaries); el init global va en sentry.*.config.ts.
 */
'use client';

import * as Sentry from '@sentry/nextjs';

function sentryEnabled(): boolean {
  return Boolean(
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SENTRY_DSN?.trim(),
  );
}

/** Reservado: la inicialización la hacen sentry.*.config.ts + instrumentation. */
export function initSentry(): void {
  /* noop — ver sentry.client.config.ts / sentry.server.config.ts */
}

export function captureException(
  error: Error,
  context?: Record<string, unknown>,
): void {
  if (!sentryEnabled()) return;
  Sentry.captureException(error, { extra: context });
}

export function captureMessage(
  message: string,
  level: 'error' | 'warning' | 'info' = 'info',
  context?: Record<string, unknown>,
): void {
  if (!sentryEnabled()) return;
  const lvl =
    level === 'error' ? 'error' : level === 'warning' ? 'warning' : 'info';
  Sentry.captureMessage(message, { level: lvl, extra: context });
}
