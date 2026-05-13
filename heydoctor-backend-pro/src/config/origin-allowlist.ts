const PRODUCTION_ORIGINS = [
  'https://heydoctor.cl',
  'https://app.heydoctor.cl',
  'https://heydoctor.vercel.app',
  'https://heydoctor-frontend.vercel.app',
];

const DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

const ENV_ORIGIN_KEYS = [
  'CORS_ORIGIN',
  'FRONTEND_URL',
  'PUBLIC_APP_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_HEYDOCTOR_API_URL',
  'VERCEL_FRONTEND_URL',
  'VERCEL_URL',
];

type OriginCallback = (err: Error | null, allow?: boolean) => void;

function splitOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeOrigin(raw: string): string {
  if (raw === '*') {
    throw new Error('Wildcard origins are not allowed');
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(withProtocol);
  return parsed.origin;
}

function envOrigins(): string[] {
  return ENV_ORIGIN_KEYS.flatMap((key) => splitOrigins(process.env[key]));
}

export function allowedOrigins(): string[] {
  const configured = [...PRODUCTION_ORIGINS, ...envOrigins()];
  const candidates =
    process.env.NODE_ENV === 'production'
      ? configured
      : [...configured, ...DEVELOPMENT_ORIGINS];

  return Array.from(
    new Set(candidates.map((origin) => normalizeOrigin(origin))),
  );
}

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }
  return allowedOrigins().includes(normalizeOrigin(origin));
}

export function corsOrigin(
  origin: string | undefined,
  callback: OriginCallback,
) {
  try {
    callback(null, isOriginAllowed(origin));
  } catch (err) {
    callback(err instanceof Error ? err : new Error(String(err)), false);
  }
}
