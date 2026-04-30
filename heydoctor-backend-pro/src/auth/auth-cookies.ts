/** Nombres y opciones de cookies de sesión (compartido entre AuthController y JwtStrategy). */

import type { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** JWT access en `main.ts` coincide con `JwtModule` (15m). */
export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cookies en peticiones cross-site (p. ej. Vercel → API en Railway) necesitan
 * `SameSite=None` + `Secure`. Con `SameSite=Lax`, el navegador no adjunta
 * `access_token` en `fetch` al dominio del API tras el login (síntoma: 201 en
 * login y 401 en `/api/auth/me`).
 *
 * Por defecto: producción (`NODE_ENV=production`) o deploy en Railway
 * (`RAILWAY_*`). Para forzar modo local explícito: `AUTH_CROSS_SITE_COOKIES=false`.
 */
export function useCrossSiteSessionCookies(): boolean {
  const raw = process.env.AUTH_CROSS_SITE_COOKIES?.trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'no') {
    return false;
  }
  if (raw === 'true' || raw === '1' || raw === 'yes') {
    return true;
  }
  if (process.env.NODE_ENV === 'production') {
    return true;
  }
  if (process.env.RAILWAY_ENVIRONMENT?.trim()) {
    return true;
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN?.trim()) {
    return true;
  }
  return false;
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
 * Dominio compartido front/back (ej. `.heydoctor.health`).
 * Opcional; si no se define, el host-only del API aplica.
 *
 * En escenario Vercel + Railway (hosts distintos), no definas `COOKIE_DOMAIN` salvo
 * que API y front compartan un dominio padre real; un valor incorrecto impide que el
 * navegador almacene la cookie.
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
  const domain = resolveCookieDomain();
  return {
    httpOnly: true,
    ...sessionCookieSameSitePolicy(),
    path,
    ...(domain ? { domain } : {}),
  };
}
