export function productionReplicaCount(): number {
  const raw =
    process.env.REPLICA_COUNT ??
    process.env.RAILWAY_REPLICAS ??
    process.env.WEB_CONCURRENCY ??
    '1';
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function assertRedisConfiguredForMultiInstanceProduction(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const replicas = productionReplicaCount();
  const redisConfigured = Boolean(process.env.REDIS_URL?.trim());

  if (isProd && replicas > 1 && !redisConfigured) {
    throw new Error('REDIS_URL required in multi-instance production');
  }
}
