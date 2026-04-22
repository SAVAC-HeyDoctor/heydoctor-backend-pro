import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';
import { CSRF_COOKIE } from './csrf.constants';
import { setCsrfCookie } from './csrf-cookie';

type ReqWithUser = Request & { user?: AuthenticatedUser };

/**
 * Sesiones existentes sin cookie CSRF: la primera respuesta autenticada la emite.
 */
@Injectable()
export class CsrfCookieInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const http = context.switchToHttp();
    const req = http.getRequest<ReqWithUser>();
    const res = http.getResponse<Response>();

    return next.handle().pipe(
      tap(() => {
        if (req.method === 'OPTIONS') return;
        if (!req.user?.sub) return;
        if (req.cookies?.[CSRF_COOKIE]) return;
        setCsrfCookie(res);
      }),
    );
  }
}
