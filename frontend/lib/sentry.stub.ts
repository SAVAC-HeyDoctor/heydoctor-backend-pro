/**
 * Stub Sentry: sin dependencia @sentry/nextjs hasta que se configure el DSN.
 *
 * Activar en el app Next real:
 * 1. pnpm add @sentry/nextjs
 * 2. Reemplazar este módulo por wrappers que llamen a Sentry.* o usar sentry.client.config.ts
 * 3. registerAlertSink en backend ya existe; aquí el equivalente es Sentry.init en instrumentation.ts
 */

let sentryReady = false;

export function initSentry(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }
  sentryReady = true;
  if (typeof console !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.info(
      '[sentry.stub] NEXT_PUBLIC_SENTRY_DSN está definido; instalar @sentry/nextjs y sustituir este stub.',
    );
  }
}

export function captureException(
  error: Error,
  context?: Record<string, unknown>,
): void {
  if (sentryReady && typeof console !== 'undefined') {
    console.debug('[sentry.stub] captureException', error.message, context);
  }
}

export function captureMessage(
  message: string,
  level: 'error' | 'warning' | 'info' = 'info',
  context?: Record<string, unknown>,
): void {
  if (sentryReady && typeof console !== 'undefined') {
    console.debug('[sentry.stub] captureMessage', level, message, context);
  }
}
