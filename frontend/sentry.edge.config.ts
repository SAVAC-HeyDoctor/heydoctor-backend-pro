import * as Sentry from '@sentry/nextjs';
import { sanitizeTelemetry } from './lib/sentry-redaction';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1,
  beforeSend(event) {
    return sanitizeTelemetry(event) as typeof event;
  },
});
