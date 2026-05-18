import {
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';

function requestMeta(context: ExecutionContext): {
  method: string | null;
  path: string | null;
  isAuthPath: boolean;
} {
  if (context.getType() !== 'http') {
    return { method: null, path: null, isAuthPath: false };
  }
  const req = context.switchToHttp().getRequest<Request>();
  const path =
    typeof req.originalUrl === 'string'
      ? req.originalUrl.split('?')[0]
      : typeof req.url === 'string'
        ? req.url.split('?')[0]
        : null;
  return {
    method: req.method ?? null,
    path,
    isAuthPath: path?.startsWith('/api/auth/') === true,
  };
}

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(AppThrottlerGuard.name);

  constructor(
    @InjectThrottlerOptions()
    options: ThrottlerModuleOptions,
    @InjectThrottlerStorage()
    storageService: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = requestMeta(context);

    try {
      const allowed = await super.canActivate(context);
      if (meta.isAuthPath) {
        this.logger.log('auth_pipeline_guard', {
          event: 'auth_pipeline_guard',
          guard: 'ThrottlerGuard',
          decision: allowed ? 'allow' : 'deny',
          method: meta.method,
          path: meta.path,
        });
      }
      return allowed;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (meta.isAuthPath) {
        this.logger.warn('auth_pipeline_guard_error', {
          event: 'auth_pipeline_guard_error',
          guard: 'ThrottlerGuard',
          method: meta.method,
          path: meta.path,
          errorName: error.name,
          statusCode: err instanceof HttpException ? err.getStatus() : null,
        });
      }
      throw err;
    }
  }
}
