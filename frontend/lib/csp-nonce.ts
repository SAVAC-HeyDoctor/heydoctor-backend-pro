/**
 * CSP por solicitud (Edge / middleware).
 * Producción: nonce + strict-dynamic (sin unsafe-eval; sin unsafe-inline en script).
 * Estilos: unsafe-inline (Tailwind / Next hasta migración completa a nonce en style).
 */

const PRODUCTION_CONNECT_DEFAULTS = [
  'https://api.heydoctor.health',
  'https://app.heydoctor.health',
  'https://heydoctor.health',
  'https://www.heydoctor.health',
];

const SENTRY_CONNECT_HOSTS = [
  'https://*.ingest.sentry.io',
  'https://*.ingest.us.sentry.io',
  'https://*.ingest.de.sentry.io',
  'https://*.sentry.io',
];

export type BuildCspOptions = {
  nonce: string;
  isProd: boolean;
  reportUri?: string;
};

function addHttpOrigin(connect: Set<string>, raw: string | undefined): void {
  const value = raw?.trim();
  if (!value) return;
  try {
    const origin = new URL(value).origin;
    connect.add(origin);
    if (/^https:\/\//i.test(origin)) {
      connect.add(origin.replace(/^https:\/\//i, 'wss://'));
    } else if (/^http:\/\//i.test(origin)) {
      connect.add(origin.replace(/^http:\/\//i, 'ws://'));
    }
  } catch {
    /* ignore invalid URL */
  }
}

function addConnectList(connect: Set<string>, raw: string | undefined): void {
  raw
    ?.split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      if (/^(stuns?|turns?):/i.test(part)) {
        connect.add(part);
        const scheme = part.split(':')[0]?.toLowerCase();
        if (scheme) connect.add(`${scheme}:`);
        return;
      }
      addHttpOrigin(connect, part);
    });
}

export function buildCspWithNonce(
  nonce: string,
  isProd: boolean,
  reportUri?: string,
): string;
export function buildCspWithNonce(options: BuildCspOptions): string;
export function buildCspWithNonce(
  nonceOrOptions: string | BuildCspOptions,
  isProdArg?: boolean,
  reportUriArg?: string,
): string {
  const opts: BuildCspOptions =
    typeof nonceOrOptions === 'string'
      ? {
          nonce: nonceOrOptions,
          isProd: isProdArg ?? false,
          reportUri: reportUriArg,
        }
      : nonceOrOptions;

  const { nonce, isProd, reportUri } = opts;
  const connect = new Set<string>(["'self'"]);

  if (isProd) {
    PRODUCTION_CONNECT_DEFAULTS.forEach((o) => addHttpOrigin(connect, o));
    connect.add('https://*.vercel.app');
    connect.add('wss://*.vercel.app');
  } else {
    addHttpOrigin(connect, 'http://localhost:3000');
    addHttpOrigin(connect, 'http://127.0.0.1:3000');
    addHttpOrigin(connect, 'http://localhost:3001');
    addHttpOrigin(connect, 'ws://localhost:3001');
    addHttpOrigin(connect, 'http://127.0.0.1:3001');
    addHttpOrigin(connect, 'ws://127.0.0.1:3001');
  }

  addHttpOrigin(connect, process.env.NEXT_PUBLIC_API_URL);
  addHttpOrigin(connect, process.env.NEXT_PUBLIC_WS_URL);
  addHttpOrigin(connect, process.env.BACKEND_PROXY_TARGET);
  addHttpOrigin(connect, process.env.NEXT_PUBLIC_APP_URL);
  addConnectList(connect, process.env.NEXT_PUBLIC_CSP_CONNECT_SRC);
  addConnectList(connect, process.env.NEXT_PUBLIC_TURN_URLS);
  addConnectList(connect, process.env.WEBRTC_STUN_URLS);

  connect.add('stun:');
  connect.add('stuns:');
  connect.add('turn:');
  connect.add('turns:');

  if (process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) {
    SENTRY_CONNECT_HOSTS.forEach((h) => connect.add(h));
  }

  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval'`;

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "child-src 'none'",
    `connect-src ${Array.from(connect).join(' ')}`,
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self'",
  ];

  if (isProd) {
    directives.push('upgrade-insecure-requests');
  }
  if (reportUri) {
    directives.push(`report-uri ${reportUri}`);
  }

  return directives.join('; ');
}
