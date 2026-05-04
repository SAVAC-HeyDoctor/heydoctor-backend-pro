/** Nombres y opciones de cookies de sesión (compartido entre AuthController y JwtStrategy). */

import type { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** JWT access en `main.ts` coincide con `JwtModule` (15m). */
export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isRailwayDeploy(): boolean {
  return (
    !!process.env.RAILWAY_ENVIRONMENT ||
    !!process.env.RAILWAY_ENVIRONMENT_NAME ||
    !!process.env.RAILWAY_PUBLIC_DOMAIN
  );
}

/**
 * Cookies cross-site (Vercel `app.*` → API Railway): `SameSite=None` + `Secure`.
 * Sin `Domain`: el navegador asocia la cookie al host del Set-Cookie (API), evita
 * valores como `.heydoctor.health` que no aplican si el API vive en otro hostname.
 */
function computeCrossSite(): boolean {
  if (process.env.AUTH_CROSS_SITE_COOKIES === 'false') {
    return false;
  }
  if (process.env.AUTH_CROSS_SITE_COOKIES === 'true') {
    return true;
  }
  const backendPublic = process.env.BACKEND_PUBLIC_URL ?? '';
  if (/heydoctor\.health/i.test(backendPublic)) {
    return true;
  }
  /** Railway: tratar API como cross-site (None + Secure) para cookies con credenciales. */
  if (isRailwayDeploy()) {
    return true;
  }
  return process.env.NODE_ENV === 'production';
}

/** Cross-site (p. ej. Vercel → Railway Nest): `SameSite=None`, `Secure`, sin `Domain`. */
export function useCrossSiteCookies(): boolean {
  return computeCrossSite();
}

/** @deprecated usar {@link useCrossSiteCookies} */
export function useCrossSiteSessionCookies(): boolean {
  return useCrossSiteCookies();
}

/**
 * Reservado: no establecer `Domain` en cookies de sesión/CSRF.
 * (Las cookies quedan host-only respecto al origen que emite Set-Cookie.)
 */
export function getAuthCookieDomain(): string | undefined {
  return undefined;
}

/**
 * Opciones HttpOnly para `access_token` y `refresh_token`.
 * Cross-site: sin `domain` para que el cliente envíe la cookie solo al API que la fijó.
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
