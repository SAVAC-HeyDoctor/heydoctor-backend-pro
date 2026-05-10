import { Logger, Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';
import { assertRedisConfiguredForMultiInstanceProduction } from '../config/redis-requirement';

const logger = new Logger('CacheModule');

@Module({
  imports: [
    NestCacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        assertRedisConfiguredForMultiInstanceProduction();
        const redisRaw = process.env.REDIS_URL ?? null;
        const redisUrl =
          typeof redisRaw === 'string' && redisRaw.trim().length > 0
            ? redisRaw.trim()
            : null;
        if (redisUrl !== null) {
          return {
            stores: [
              new Keyv({
                store: new KeyvRedis(redisUrl),
              }),
            ],
          };
        }
        logger.warn(
          'REDIS_URL is not set; using in-memory cache (not shared across instances).',
        );
        return {};
      },
    }),
  ],
  exports: [NestCacheModule],
})
export class AppCacheModule {}
