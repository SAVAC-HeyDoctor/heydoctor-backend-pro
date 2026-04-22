/**
 * CSP por solicitud (Edge / middleware). Nonce por request + `unsafe-inline` temporal;
 * siguiente paso: `strict-dynamic` y scripts con `nonce` explícito.
 */
export function buildCspWithNonce(nonce: string, isProd: boolean): string {
  let connect = "'self'";
  const api = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (api) {
    try {
      connect += ` ${new URL(api).origin}`;
    } catch {
      /* ignore */
    }
  }
  if (process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) {
    connect +=
      ' https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://*.ingest.us.sentry.io';
  }

  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'unsafe-inline'`
    : `'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'`;

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `connect-src ${connect}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc}`,
    "form-action 'self'",
  ].join('; ');
}
