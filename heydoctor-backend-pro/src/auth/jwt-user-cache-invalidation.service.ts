import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, type LoggerService } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { APP_LOGGER } from '../common/logger/logger.tokens';
import { invalidateUserCache } from './jwt-user-cache.helper';

@Injectable()
export class JwtUserCacheInvalidationService {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @Inject(APP_LOGGER) private readonly logger: LoggerService,
  ) {}

  async invalidateUserCache(userId: string): Promise<void> {
    await invalidateUserCache(this.cache, userId, this.logger);
  }
}
