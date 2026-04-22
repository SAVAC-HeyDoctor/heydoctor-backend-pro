/**
 * Logging cliente estructurado (sin PII). En producción: nivel mínimo; preparado para Sentry.
 */

import { captureException, captureMessage, initSentry } from './sentry';

/** Llamar una vez desde el root del cliente Next (p. ej. layout cliente). */
export function initClientObservability(): void {
  initSentry();
}

const isDev =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'development';

export type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type ClientLogPayload = {
  event: string;
  requestId?: string | null;
  [key: string]: unknown;
};

function readRequestIdFromResponse(res: Response): string | null {
  return res.headers.get('X-Request-Id') ?? res.headers.get('x-request-id');
}

/** Adjuntar requestId del backend si tienes la Response a mano. */
export function withRequestId(
  payload: ClientLogPayload,
  res?: Response,
): ClientLogPayload {
  if (!res) return payload;
  const rid = readRequestIdFromResponse(res);
  return rid ? { ...payload, requestId: rid } : payload;
}

function emit(level: ClientLogLevel, message: string, payload?: ClientLogPayload) {
  const line = payload ? `${message} ${JSON.stringify(payload)}` : message;
  if (level === 'error') {
    console.error(line);
    if (payload?.event) {
      captureMessage(payload.event, 'error', payload);
    }
  } else if (level === 'warn') {
    console.warn(line);
    if (payload?.event) {
      captureMessage(payload.event, 'warning', payload);
    }
  } else if (isDev && (level === 'debug' || level === 'info')) {
    console.log(line);
  }
}

export const clientLogger = {
  debug(event: string, meta?: Record<string, unknown>) {
    if (isDev) emit('debug', event, { event, ...meta });
  },
  info(event: string, meta?: Record<string, unknown>) {
    emit('info', event, { event, ...meta });
  },
  warn(event: string, meta?: Record<string, unknown>) {
    emit('warn', event, { event, ...meta });
  },
  error(event: string, err?: unknown, meta?: Record<string, unknown>) {
    const payload: ClientLogPayload = {
      event,
      ...meta,
      errorName: err instanceof Error ? err.name : typeof err,
    };
    emit('error', event, payload);
    if (err instanceof Error) {
      captureException(err, payload);
    }
  },
};
