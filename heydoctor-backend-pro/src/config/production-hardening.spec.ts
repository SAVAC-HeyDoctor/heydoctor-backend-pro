import { assertRedisConfiguredForMultiInstanceProduction } from './redis-requirement';
import { buildTypeOrmSslConfig } from './typeorm-ssl';

describe('production hardening config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.REDIS_URL;
    delete process.env.REPLICA_COUNT;
    delete process.env.RAILWAY_REPLICAS;
    delete process.env.WEB_CONCURRENCY;
    delete process.env.DATABASE_SSL_CA;
    delete process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('requires Redis for multi-instance production', () => {
    process.env.NODE_ENV = 'production';
    process.env.REPLICA_COUNT = '2';

    expect(() => assertRedisConfiguredForMultiInstanceProduction()).toThrow(
      'REDIS_URL required in multi-instance production',
    );
  });

  it('allows single-instance production without Redis', () => {
    process.env.NODE_ENV = 'production';
    process.env.REPLICA_COUNT = '1';

    expect(() =>
      assertRedisConfiguredForMultiInstanceProduction(),
    ).not.toThrow();
  });

  it('does not disable Postgres TLS verification in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = 'false';

    expect(buildTypeOrmSslConfig('postgres://db.example.com/app')).toEqual({
      rejectUnauthorized: true,
    });
  });
});
