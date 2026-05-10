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
 * - `DATABASE_SSL_REJECT_UNAUTHORIZED=false`: confiar sin verificar cadena solo fuera de producción.
 * - `DATABASE_SSL_REJECT_UNAUTHORIZED=true`: forzar verificación estricta (requiere CA pública o `DATABASE_SSL_CA`).
 */

export type TypeOrmSslConfig =
  | boolean
  | { rejectUnauthorized: boolean; ca?: string };

export type TypeOrmExtraConfig =
  | {
      ssl: {
        rejectUnauthorized: boolean;
      };
    }
  | undefined;

function isLocalDatabaseUrl(url: string): boolean {
  return (
    !url ||
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    url.includes('@host.docker.internal')
  );
}

export function buildTypeOrmSslConfig(databaseUrl: string): TypeOrmSslConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProd = nodeEnv === 'production';

  if (isProd) {
    return {
      rejectUnauthorized: false,
    };
  }

  if (isLocalDatabaseUrl(databaseUrl)) {
    return false;
  }

  const ca = process.env.DATABASE_SSL_CA?.trim();
  if (ca) {
    return { rejectUnauthorized: true, ca };
  }

  const rejectRaw = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.trim();
  if (rejectRaw === 'false') {
    return { rejectUnauthorized: isProd };
  }
  if (rejectRaw === 'true') {
    return { rejectUnauthorized: true };
  }

  return { rejectUnauthorized: false };
}

export function buildTypeOrmExtraConfig(): TypeOrmExtraConfig {
  return process.env.NODE_ENV === 'production'
    ? {
        ssl: {
          rejectUnauthorized: false,
        },
      }
    : undefined;
}
