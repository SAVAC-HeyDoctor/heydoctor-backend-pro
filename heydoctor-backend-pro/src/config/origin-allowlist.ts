import { Logger } from '@nestjs/common';
import type { IncomingMessage } from 'http';

const PRODUCTION_ORIGINS = [
  'https://heydoctor.cl',
  'https://app.heydoctor.cl',
  'https://heydoctor.vercel.app',
  'https://heydoctor-frontend.vercel.app',
];

const DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

const ENV_ORIGIN_KEYS = [
  'CORS_ALLOWED_ORIGINS',
  'CORS_ORIGIN',
  'FRONTEND_URL',
  'PUBLIC_APP_URL',
  'NEXT_PUBLIC_APP_URL',
  'VERCEL_FRONTEND_URL',
  'VERCEL_URL',
];

type OriginCallback = (err: Error | null, allow?: boolean) => void;
type SocketAllowRequestCallback = (
  err: string | null,
  success: boolean,
) => void;

const originLogger = new Logger('OriginAllowlist');

function splitOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeOrigin(raw: string): string {
  if (raw === '*') {
    throw new Error('Wildcard origins are not allowed');
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(withProtocol);
  return parsed.origin;
}

function safeOriginForLog(origin: string | undefined): string {
  if (!origin) return '(missing)';
  try {
    return normalizeOrigin(origin);
  } catch {
    return '(invalid)';
  }
}

function envOrigins(): string[] {
  return ENV_ORIGIN_KEYS.flatMap((key) => splitOrigins(process.env[key]));
}

export function allowedOrigins(): string[] {
  const configured = [...PRODUCTION_ORIGINS, ...envOrigins()];
  const candidates =
    process.env.NODE_ENV === 'production'
      ? configured
      : [...configured, ...DEVELOPMENT_ORIGINS];

  return Array.from(
    new Set(candidates.map((origin) => normalizeOrigin(origin))),
  );
}

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }
  return allowedOrigins().includes(normalizeOrigin(origin));
}

export function logBlockedOrigin(
  origin: string | undefined,
  transport: 'http' | 'websocket',
): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  originLogger.warn('origin_blocked', {
    event: 'origin_blocked',
    transport,
    origin: safeOriginForLog(origin),
  });
}

export function corsOrigin(
  origin: string | undefined,
  callback: OriginCallback,
) {
  try {
    const allowed = isOriginAllowed(origin);
    if (!allowed) {
      logBlockedOrigin(origin, 'http');
    }
    callback(null, allowed);
  } catch (err) {
    logBlockedOrigin(origin, 'http');
    callback(err instanceof Error ? err : new Error(String(err)), false);
  }
}

export function socketAllowRequest(
  req: IncomingMessage,
  callback: SocketAllowRequestCallback,
): void {
  const rawOrigin: unknown = req.headers.origin;
  const origin =
    typeof rawOrigin === 'string'
      ? rawOrigin
      : Array.isArray(rawOrigin) && typeof rawOrigin[0] === 'string'
        ? rawOrigin[0]
        : undefined;
  try {
    const allowed = isOriginAllowed(origin);
    if (!allowed) {
      logBlockedOrigin(origin, 'websocket');
      callback('origin not allowed', false);
      return;
    }
    callback(null, true);
  } catch {
    logBlockedOrigin(origin, 'websocket');
    callback('origin not allowed', false);
  }
}
