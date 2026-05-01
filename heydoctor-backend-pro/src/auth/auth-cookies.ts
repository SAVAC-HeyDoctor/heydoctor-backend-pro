/** Nombres y opciones de cookies de sesión (compartido entre AuthController y JwtStrategy). */

import type { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** JWT access en `main.ts` coincide con `JwtModule` (15m). */
export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Lee entorno en cada llamada (no al importar el módulo). Así en Railway/prod
 * `NODE_ENV` / `RAILWAY_*` ya están definidos y no caemos en Lax por evaluación temprana.
 */
function computeCrossSite(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    !!process.env.RAILWAY_ENVIRONMENT ||
    !!process.env.RAILWAY_PUBLIC_DOMAIN
  );
}

/** Cross-site (Vercel → Railway): `SameSite=None` + `Secure`. Sin `Domain`. */
export function useCrossSiteCookies(): boolean {
  return computeCrossSite();
}

/** @deprecated usar {@link useCrossSiteCookies} */
export function useCrossSiteSessionCookies(): boolean {
  return useCrossSiteCookies();
}

/**
 * Opciones HttpOnly para `access_token` y `refresh_token`.
 * Siempre invocar al setear cookies (no cachear en constante de módulo).
 */
export function getSessionCookieOptions(): CookieOptions {
  if (computeCrossSite()) {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
    };
  }
  return {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
  };
}

/** `secure` + `sameSite` para cookie CSRF (no HttpOnly). */
export function sessionCookieSameSitePolicy(): Pick<
  CookieOptions,
  'secure' | 'sameSite'
> {
  if (computeCrossSite()) {
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
    ...getSessionCookieOptions(),
    path,
  };
}
