/** Nombres y opciones de cookies de sesión (compartido entre AuthController y JwtStrategy). */

import type { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** JWT access en `main.ts` coincide con `JwtModule` (15m). */
export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Producción / Railway / API HeyDoctor: cookies cross-site válidas (Chrome exige Secure + None).
 * Requiere `app.set('trust proxy', 1)` para que Express vea HTTPS vía `X-Forwarded-Proto`.
 */
const isProd =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.RAILWAY_ENVIRONMENT) ||
  (process.env.BACKEND_PUBLIC_URL ?? '').includes('heydoctor.health');

const PROD_SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
};

const DEV_SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: false,
  sameSite: 'lax',
  path: '/',
};

/** Cross-site (p. ej. Vercel → Railway): `SameSite=None` + `Secure`, sin `Domain`. */
export function useCrossSiteCookies(): boolean {
  return isProd;
}

/** @deprecated usar {@link useCrossSiteCookies} */
export function useCrossSiteSessionCookies(): boolean {
  return useCrossSiteCookies();
}

/** Sin `Domain`: host-only para el origin que envía Set-Cookie. */
export function getAuthCookieDomain(): string | undefined {
  return undefined;
}

/** `access_token` y `refresh_token`. */
export function getSessionCookieOptions(): CookieOptions {
  const base = isProd ? PROD_SESSION_COOKIE_OPTIONS : DEV_SESSION_COOKIE_OPTIONS;
  return { ...base };
}

/**
 * Cookie CSRF (no HttpOnly; token también en JSON + cabecera en cross-origin).
 * Misma política Secure / SameSite que la sesión.
 */
export function sessionCookieSameSitePolicy(): Pick<
  CookieOptions,
  'secure' | 'sameSite'
> {
  return isProd
    ? { secure: true, sameSite: 'none' }
    : { secure: false, sameSite: 'lax' };
}

/** Chrome/third-party: constante útil si se comparan valores en otro módulo. */
export const CROSS_SITE_SESSION_COOKIE_OPTIONS: CookieOptions = {
  ...PROD_SESSION_COOKIE_OPTIONS,
};

export const SESSION_COOKIE_PATH = '/';

export type AuthCookieBaseOptions = Pick<
  CookieOptions,
  'httpOnly' | 'secure' | 'sameSite' | 'path'
>;

export function authCookieBase(
  path: string = SESSION_COOKIE_PATH,
): CookieOptions {
  return {
    ...getSessionCookieOptions(),
    path,
  };
}
