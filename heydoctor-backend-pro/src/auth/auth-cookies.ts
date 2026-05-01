/** Nombres y opciones de cookies de sesión (compartido entre AuthController y JwtStrategy). */

import type { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** JWT access en `main.ts` coincide con `JwtModule` (15m). */
export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const isProduction = process.env.NODE_ENV === 'production';

const isRailway =
  !!process.env.RAILWAY_ENVIRONMENT?.trim() ||
  !!process.env.RAILWAY_PUBLIC_DOMAIN?.trim();

/**
 * Peticiones cross-origin (p. ej. frontend Vercel → API Railway): el navegador
 * solo envía cookies con `SameSite=None` y `Secure=true`. Con `Lax`, tras el
 * login las peticiones a `/api/auth/me` llegan sin `access_token` → 401.
 *
 * `AUTH_CROSS_SITE_COOKIES=false` fuerza modo local (Lax + sin Secure).
 * `AUTH_CROSS_SITE_COOKIES=true` fuerza cross-site aunque no sea prod/Railway.
 *
 * No usar atributo `Domain` en cookies para este escenario (hosts distintos).
 */
export function useCrossSiteSessionCookies(): boolean {
  const raw = process.env.AUTH_CROSS_SITE_COOKIES?.trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'no') {
    return false;
  }
  if (raw === 'true' || raw === '1' || raw === 'yes') {
    return true;
  }
  return isProduction || isRailway;
}

/** `secure` + `sameSite` compartidos entre cookies HttpOnly y CSRF. */
export function sessionCookieSameSitePolicy(): Pick<
  CookieOptions,
  'secure' | 'sameSite'
> {
  if (useCrossSiteSessionCookies()) {
    return { secure: true, sameSite: 'none' };
  }
  return { secure: false, sameSite: 'lax' };
}

/**
 * Una sola ruta para access y refresh: el navegador las adjunta en todas las
 * peticiones al mismo host del API (p. ej. `/api/auth/me`, `/api/auth/refresh`).
 */
export const SESSION_COOKIE_PATH = '/';

export type AuthCookieBaseOptions = Pick<
  CookieOptions,
  'httpOnly' | 'secure' | 'sameSite' | 'path'
>;

export function authCookieBase(
  path: string = SESSION_COOKIE_PATH,
): CookieOptions {
  return {
    httpOnly: true,
    ...sessionCookieSameSitePolicy(),
    path,
  };
}

/** Para logs de diagnóstico (login): objeto serializable sin secretos. */
export function authSessionCookieOptionsSnapshot(path: string): CookieOptions {
  return authCookieBase(path);
}
