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

/** Cross-site (Vercel app. → Railway pro-api.): `SameSite=None` + `Secure` + opcional `Domain` compartido. */
export function useCrossSiteCookies(): boolean {
  return computeCrossSite();
}

/** @deprecated usar {@link useCrossSiteCookies} */
export function useCrossSiteSessionCookies(): boolean {
  return useCrossSiteCookies();
}

/**
 * Dominio registrable para cookies (p. ej. `.heydoctor.health`) y compartir sesión entre
 * `app.heydoctor.health` y `pro-api.heydoctor.health` (middleware SSR + fetch credencialed).
 *
 * - `AUTH_COOKIE_DOMAIN=.heydoctor.health` (recomendado en Railway).
 * - Si no está definido y el host público del API es un subdominio de producción, se infiere `.registrable.tld`.
 * - En local / sin cross-site: `undefined` (cookie host-only).
 */
export function getAuthCookieDomain(): string | undefined {
  const explicit = process.env.AUTH_COOKIE_DOMAIN?.trim();
  if (explicit && /^(none|false|0)$/i.test(explicit)) {
    return undefined;
  }
  if (explicit) {
    return explicit.startsWith('.') ? explicit : `.${explicit}`;
  }
  if (!computeCrossSite()) {
    return undefined;
  }

  const backend =
    process.env.BACKEND_PUBLIC_URL?.trim() ||
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN.replace(/^https?:\/\//i, '')}`
      : undefined);
  if (!backend) {
    return undefined;
  }
  try {
    const url = backend.includes('://') ? backend : `https://${backend}`;
    const { hostname } = new URL(url);
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      return undefined;
    }
    // `pro-api.heydoctor.health` → `.heydoctor.health`
    const parts = hostname.split('.').filter(Boolean);
    if (parts.length >= 2) {
      const registrable = parts.slice(-2).join('.');
      return `.${registrable}`;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Opciones HttpOnly para `access_token` y `refresh_token`.
 * Siempre invocar al setear cookies (no cachear en constante de módulo).
 */
export function getSessionCookieOptions(): CookieOptions {
  const domain = getAuthCookieDomain();
  if (computeCrossSite()) {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      ...(domain ? { domain } : {}),
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
