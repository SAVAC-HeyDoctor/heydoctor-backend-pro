import { Logger, Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import KeyvRedis from '@keyv/redis';
import { Keyv } from 'keyv';

const logger = new Logger('CacheModule');

@Module({
  imports: [
    NestCacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        const redisUrl = process.env.REDIS_URL?.trim();
        if (redisUrl) {
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
