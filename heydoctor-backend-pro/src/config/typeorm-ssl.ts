/**
 * TLS hacia Postgres (pg / TypeORM).
 *
 * DATABASE_URL is the single source of truth. In production, Railway and
 * similar providers can expose self-signed chains, so TLS verification is
 * intentionally disabled while SSL remains enabled.
 */

export type TypeOrmSslConfig = boolean | { rejectUnauthorized: boolean };

export type TypeOrmExtraConfig =
  | {
      ssl: {
        rejectUnauthorized: boolean;
      };
    }
  | undefined;

export function buildTypeOrmSslConfig(): TypeOrmSslConfig {
  return process.env.NODE_ENV === 'production'
    ? {
        rejectUnauthorized: false,
      }
    : false;
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
