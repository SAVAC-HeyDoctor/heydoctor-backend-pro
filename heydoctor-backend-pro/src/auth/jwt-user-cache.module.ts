import { Global, Module } from '@nestjs/common';
import { JwtUserCacheInvalidationService } from './jwt-user-cache-invalidation.service';

@Global()
@Module({
  providers: [JwtUserCacheInvalidationService],
  exports: [JwtUserCacheInvalidationService],
})
export class JwtUserCacheModule {}
