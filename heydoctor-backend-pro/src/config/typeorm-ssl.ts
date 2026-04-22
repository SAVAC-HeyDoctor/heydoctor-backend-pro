/**
 * TLS hacia Postgres: en producción no se usa `rejectUnauthorized: false`.
 * Opcional: `DATABASE_SSL_CA` (PEM) para CAs intermedias / privadas.
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

export function buildTypeOrmSslConfig(databaseUrl: string): TypeOrmSslConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const isProd = nodeEnv === 'production';

  if (isLocalDatabaseUrl(databaseUrl)) {
    return false;
  }

  if (isProd) {
    const ca = process.env.DATABASE_SSL_CA?.trim();
    return {
      rejectUnauthorized: true,
      ...(ca ? { ca } : {}),
    };
  }

  return { rejectUnauthorized: false };
}
