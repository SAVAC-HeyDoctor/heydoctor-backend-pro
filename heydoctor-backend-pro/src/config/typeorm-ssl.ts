/**
 * TLS hacia Postgres (pg / TypeORM).
 *
 * En Railway, el proxy TCP suele presentar una cadena que Node no valida con el
 * trust store por defecto → `SELF_SIGNED_CERT_IN_CHAIN`. Railway inyecta
 * `RAILWAY_PROJECT_ID` (u otras `RAILWAY_*`) en runtime; también detectamos
 * hosts `*.rlwy.net` y `*.railway.internal` por si se conecta desde fuera.
 *
 * Overrides:
 * - `DATABASE_SSL_CA` (PEM): verificación estricta con esa CA.
 * - `DATABASE_SSL_REJECT_UNAUTHORIZED=false`: confiar sin verificar cadena (último recurso).
 * - `DATABASE_SSL_REJECT_UNAUTHORIZED=true`: forzar verificación estricta (requiere CA pública o `DATABASE_SSL_CA`).
 *
 * TEMPORAL: en producción sin `DATABASE_SSL_CA` (y sin `DATABASE_SSL_REJECT_UNAUTHORIZED=true`),
 * se usa `rejectUnauthorized: false` para desbloquear Railway hasta montar la CA.
 */

export type TypeOrmSslConfig =
  | boolean
  | { rejectUnauthorized: boolean; ca?: string };

function isLocalDatabaseUrl(url: string): boolean {
  return (
    !url ||
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    url.includes('@host.docker.internal')
  );
}

function databaseUrlHost(url: string): string | null {
  try {
    const normalized = url.replace(/^postgresql:\/\//i, 'postgres://');
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    const m = /@([^/:?]+)/.exec(url);
    return m ? m[1].toLowerCase() : null;
  }
}

/** Deploy en Railway (variables de sistema del proveedor). */
function isRailwayRuntime(): boolean {
  return Boolean(
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_ENVIRONMENT_ID ||
    process.env.RAILWAY_SERVICE_ID,
  );
}

/** Host típico del proxy TCP / red privada de Postgres en Railway. */
function isLikelyRailwayPostgresHost(url: string): boolean {
  const host = databaseUrlHost(url);
  if (host) {
    return host.endsWith('.rlwy.net') || host.endsWith('.railway.internal');
  }
  return /\.rlwy\.net|railway\.internal/i.test(url);
}

function needsRailwayStyleTlsRelief(url: string): boolean {
  return isRailwayRuntime() || isLikelyRailwayPostgresHost(url);
}

export function buildTypeOrmSslConfig(databaseUrl: string): TypeOrmSslConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProd = nodeEnv === 'production';

  if (isLocalDatabaseUrl(databaseUrl)) {
    return false;
  }

  const ca = process.env.DATABASE_SSL_CA?.trim();
  if (ca) {
    return { rejectUnauthorized: true, ca };
  }

  const rejectRaw = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.trim();
  if (rejectRaw === 'false') {
    return { rejectUnauthorized: false };
  }
  if (rejectRaw === 'true') {
    return { rejectUnauthorized: true };
  }

  if (isProd) {
    if (needsRailwayStyleTlsRelief(databaseUrl)) {
      return { rejectUnauthorized: false };
    }
    // TEMPORAL: mismo tratamiento que Railway — sin CA, Node rechaza la cadena del proxy.
    return { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: false };
}
