/** Nombres y opciones de cookies de sesión (compartido entre AuthController y JwtStrategy). */

import type { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** JWT access en `main.ts` coincide con `JwtModule` (15m). */
export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const isProduction = process.env.NODE_ENV === 'production';

const isRailway =
  !!process.env.RAILWAY_ENVIRONMENT ||
  !!process.env.RAILWAY_PUBLIC_DOMAIN;

/**
 * Cross-site (Vercel → Railway): obligatorio `SameSite=None` + `Secure`.
 * Sin `Domain` (hosts distintos).
 */
export const useCrossSiteCookies = isProduction || isRailway;

/** Compat: mismo criterio que `useCrossSiteCookies`. */
export function useCrossSiteSessionCookies(): boolean {
  return useCrossSiteCookies;
}

/**
 * Opciones base para `access_token` y `refresh_token` (HttpOnly).
 * En local sin HTTPS: Lax + sin Secure para que el login siga funcionando.
 */
export const cookieOptions: CookieOptions = useCrossSiteCookies
  ? {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
    }
  : {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    };

/** `secure` + `sameSite` compartidos (p. ej. cookie CSRF legible por JS). */
export function sessionCookieSameSitePolicy(): Pick<
  CookieOptions,
  'secure' | 'sameSite'
> {
  if (useCrossSiteCookies) {
    return { secure: true, sameSite: 'none' };
  }
  return { secure: false, sameSite: 'lax' };
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
    ...cookieOptions,
    path,
  };
}
