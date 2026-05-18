import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  CSRF_SKIP_PATH_PREFIXES,
} from './csrf.constants';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT']);

function requestPath(req: Request): string {
  const raw = (req.originalUrl ?? req.url ?? '').split('?')[0] ?? '';
  if (raw.startsWith('/api/') || raw === '/api') {
    return raw;
  }
  if (raw.startsWith('/')) {
    return `/api${raw}`;
  }
  return raw;
}

function headerValue(req: Request, name: string): string | undefined {
  const raw = req.headers[name] ?? req.headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === 'string' ? raw : undefined;
}

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly logger = new Logger(CsrfGuard.name);

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request>();
    const method = req.method.toUpperCase();
    if (SAFE_METHODS.has(method)) {
      return true;
    }

    const path = requestPath(req);
    for (const prefix of CSRF_SKIP_PATH_PREFIXES) {
      if (path === prefix || path.startsWith(`${prefix}/`)) {
        if (path.startsWith('/api/auth/')) {
          this.logger.log('auth_pipeline_guard', {
            event: 'auth_pipeline_guard',
            guard: 'CsrfGuard',
            decision: 'skip_prefix',
            method,
            path,
            prefix,
          });
        }
        return true;
      }
    }

    const cookieRaw = (req as { cookies?: Record<string, unknown> }).cookies?.[
      CSRF_COOKIE
    ];
    const cookieVal = typeof cookieRaw === 'string' ? cookieRaw : undefined;
    const headerVal = headerValue(req, CSRF_HEADER);
    if (
      !cookieVal ||
      !headerVal ||
      cookieVal.length < 16 ||
      cookieVal !== headerVal
    ) {
      if (path.startsWith('/api/auth/')) {
        this.logger.warn('auth_pipeline_guard_error', {
          event: 'auth_pipeline_guard_error',
          guard: 'CsrfGuard',
          method,
          path,
          reason: 'csrf_validation_failed',
          hasCookie: Boolean(cookieVal),
          hasHeader: Boolean(headerVal),
        });
      }
      throw new ForbiddenException('CSRF validation failed');
    }
    if (path.startsWith('/api/auth/')) {
      this.logger.log('auth_pipeline_guard', {
        event: 'auth_pipeline_guard',
        guard: 'CsrfGuard',
        decision: 'allow',
        method,
        path,
      });
    }
    return true;
  }
}
