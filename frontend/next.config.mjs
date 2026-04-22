/**
 * Rewrites opcionales: el navegador llama a /api/* en el mismo origen (Vercel)
 * y Next reenvía al backend sin inyectar Authorization (solo cookies si mismo dominio).
 *
 * Definir BACKEND_PROXY_TARGET=https://tu-backend.railway.app
 * y NEXT_PUBLIC_USE_API_PROXY=1 + getApiBase() vacío en api-client.
 */
import { withSentryConfig } from '@sentry/nextjs';

const target = (process.env.BACKEND_PROXY_TARGET ?? '').replace(/\/$/, '');
const isProd = process.env.NODE_ENV === 'production';

/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Solo el App Router; el resto del toolkit se valida con `tsc`. */
  eslint: {
    dirs: ['app'],
  },
  async rewrites() {
    if (!target) return [];
    return [{ source: '/api/:path*', destination: `${target}/api/:path*` }];
  },
  async headers() {
    const list = [
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
      /** CSP (nonce + connect-src): ver `middleware.ts` para no duplicar directivas. */
    ];
    if (isProd) {
      list.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      });
    }
    return [{ source: '/:path*', headers: list }];
  },
};

const hasSentryDsn = Boolean((process.env.NEXT_PUBLIC_SENTRY_DSN ?? '').trim());
const sentryWrapped = hasSentryDsn
  ? withSentryConfig(nextConfig, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
    })
  : nextConfig;

export default sentryWrapped;
