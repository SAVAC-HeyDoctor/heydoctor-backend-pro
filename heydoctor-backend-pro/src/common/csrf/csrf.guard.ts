import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
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
        return true;
      }
    }

    const cookieVal = req.cookies?.[CSRF_COOKIE];
    const headerVal = headerValue(req, CSRF_HEADER);
    if (
      !cookieVal ||
      !headerVal ||
      cookieVal.length < 16 ||
      cookieVal !== headerVal
    ) {
      throw new ForbiddenException('CSRF validation failed');
    }
    return true;
  }
}
