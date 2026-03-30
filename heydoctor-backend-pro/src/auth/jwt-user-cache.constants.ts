/** Must match keys used in {@link JwtStrategy} validation cache. */
export const JWT_USER_CACHE_KEY_PREFIX = 'jwt:user:' as const;

export function getJwtUserCacheKey(userId: string): string {
  return `${JWT_USER_CACHE_KEY_PREFIX}${userId}`;
}
