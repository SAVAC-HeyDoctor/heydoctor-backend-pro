/** Nombres y opciones de cookies de sesión (compartido entre AuthController y JwtStrategy). */

import type { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** JWT access en `main.ts` coincide con `JwtModule` (15m). */
export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Chrome/third-party: `SameSite=None` exige `Secure`; sin `domain` (host-only del API). */
export const CROSS_SITE_SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
};

/** Solo `http localhost` contra API HTTP local; NO usar en Vercel→Railway. */
const LOCAL_DEV_SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: false,
  sameSite: 'lax',
  path: '/',
};

function isRailwayDeploy(): boolean {
  return (
    !!process.env.RAILWAY_ENVIRONMENT ||
    !!process.env.RAILWAY_ENVIRONMENT_NAME ||
    !!process.env.RAILWAY_PUBLIC_DOMAIN
  );
}

/**
 * Rutas públicas/API desplegadas: siempre atributos cross-site válidos para credenciales
 * desde otro origin (p. ej. app Vercel → API Railway).
 *
 * Solo en desarrollo local (sin Railway/public URL HeyDoctor) se usa `lax` si no fuerzas cross-site.
 */
function useStrictCrossSiteCookieAttributes(): boolean {
  if (
    process.env.NODE_ENV === 'production' ||
    isRailwayDeploy() ||
    /heydoctor\.health/i.test(process.env.BACKEND_PUBLIC_URL ?? '')
  ) {
    return true;
  }
  if (process.env.AUTH_CROSS_SITE_COOKIES === 'false') {
    return false;
  }
  return process.env.AUTH_CROSS_SITE_COOKIES === 'true';
}

/** Cross-site (p. ej. Vercel → Railway Nest): `SameSite=None` + `Secure`, sin `Domain`. */
export function useCrossSiteCookies(): boolean {
  return useStrictCrossSiteCookieAttributes();
}

/** @deprecated usar {@link useCrossSiteCookies} */
export function useCrossSiteSessionCookies(): boolean {
  return useCrossSiteCookies();
}

/** Sin `Domain`: host-only para el origin que envía Set-Cookie. */
export function getAuthCookieDomain(): string | undefined {
  return undefined;
}

/**
 * `access_token` y `refresh_token`: en deploy, siempre `{ httpOnly, secure, sameSite:none, path }`.
 */
export function getSessionCookieOptions(): CookieOptions {
  return useStrictCrossSiteCookieAttributes()
    ? { ...CROSS_SITE_SESSION_COOKIE_OPTIONS }
    : { ...LOCAL_DEV_SESSION_COOKIE_OPTIONS };
}

/**
 * Cookie CSRF (legible desde JS solo en mismo-site; cross-site el valor va en JSON + cabecera).
 * Mismos `secure` / `sameSite` que sesión cuando aplica cross-site.
 */
export function sessionCookieSameSitePolicy(): Pick<
  CookieOptions,
  'secure' | 'sameSite'
> {
  return useStrictCrossSiteCookieAttributes()
    ? { secure: true, sameSite: 'none' }
    : { secure: false, sameSite: 'lax' };
}

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
