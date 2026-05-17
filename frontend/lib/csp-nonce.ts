/**
 * CSP por solicitud (Edge / middleware). Nonce por request + `unsafe-inline` temporal;
 * siguiente paso: `strict-dynamic` y scripts con `nonce` explícito.
 */
export function buildCspWithNonce(nonce: string, isProd: boolean): string {
  const connect = new Set(["'self'"]);
  const addOrigin = (raw: string | undefined): void => {
    const value = raw?.trim();
    if (!value) return;
    try {
      const origin = new URL(value).origin;
      connect.add(origin);
      connect.add(origin.replace(/^https:\/\//i, 'wss://'));
      connect.add(origin.replace(/^http:\/\//i, 'ws://'));
    } catch {
      /* ignore */
    }
  };
  const addList = (raw: string | undefined): void => {
    raw
      ?.split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        if (/^(stuns?|turns?):$/i.test(part)) {
          connect.add(part.toLowerCase());
          return;
        }
        if (/^(stuns?|turns?):/i.test(part)) {
          connect.add(part.split(':', 1)[0].toLowerCase() + ':');
          return;
        }
        addOrigin(part);
      });
  };

  addOrigin(process.env.NEXT_PUBLIC_API_URL);
  addOrigin(process.env.NEXT_PUBLIC_WS_URL);
  addOrigin(process.env.BACKEND_PROXY_TARGET);
  addList(process.env.NEXT_PUBLIC_CSP_CONNECT_SRC);
  addList(process.env.NEXT_PUBLIC_TURN_URLS);
  connect.add('stun:');
  connect.add('stuns:');
  connect.add('turn:');
  connect.add('turns:');

  if (!isProd) {
    connect.add('http://localhost:3001');
    connect.add('ws://localhost:3001');
    connect.add('http://127.0.0.1:3001');
    connect.add('ws://127.0.0.1:3001');
  }
  if (process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) {
    connect.add('https://*.ingest.sentry.io');
    connect.add('https://*.ingest.de.sentry.io');
    connect.add('https://*.ingest.us.sentry.io');
  }

  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'unsafe-inline'`
    : `'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'`;

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `connect-src ${Array.from(connect).join(' ')}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc}`,
    "form-action 'self'",
  ].join('; ');
}
