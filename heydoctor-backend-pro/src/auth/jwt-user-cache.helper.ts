import type { LoggerService } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { getJwtUserCacheKey } from './jwt-user-cache.constants';

/**
 * Drops cached JWT validation payload for this user.
 * Safe to call after DB updates to email, role, or future active flags.
 */
export async function invalidateUserCache(
  cache: Cache,
  userId: string,
  logger?: LoggerService,
): Promise<void> {
  try {
    await cache.del(getJwtUserCacheKey(userId));
    logger?.debug?.(`JWT cache invalidated for user: ${userId}`);
  } catch (err) {
    logger?.warn?.(
      `JWT cache invalidation failed for user: ${userId}`,
      err instanceof Error ? err.message : String(err),
    );
  }
}
