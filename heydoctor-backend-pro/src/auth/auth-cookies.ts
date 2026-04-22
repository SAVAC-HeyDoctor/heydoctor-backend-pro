/** Nombres y opciones de cookies de sesión (compartido entre AuthController y JwtStrategy). */

import type { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** JWT access en `main.ts` coincide con `JwtModule` (15m). */
export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Dominio compartido front/back (ej. `.heydoctor.health`).
 * Opcional; si no se define, el host-only del API aplica.
 */
export function resolveCookieDomain(): string | undefined {
  const raw = process.env.COOKIE_DOMAIN?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

export type AuthCookieBaseOptions = Pick<
  CookieOptions,
  'httpOnly' | 'secure' | 'sameSite' | 'path' | 'domain'
>;

export function authCookieBase(path: string): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  const domain = resolveCookieDomain();
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path,
    ...(domain ? { domain } : {}),
  };
}
