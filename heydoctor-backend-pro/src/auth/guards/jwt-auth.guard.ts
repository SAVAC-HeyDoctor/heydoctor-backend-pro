import {
  ContextType,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedUser } from '../strategies/jwt.strategy';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // WebSocket / RPC: Passport-JWT usa `Request` HTTP; en `ws` rompe el flujo del gateway.
    // p. ej. WebrtcGateway ya valida JWT en handleConnection (`client.handshake`).
    const ctxType = context.getType<ContextType>();
    if (ctxType !== 'http') {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context) as boolean | Promise<boolean>;
  }

  /**
   * Passport pasa `JsonWebTokenError` / `TokenExpiredError` como `err` no-HTTP → 500 si se re-lanza tal cual.
   * Siempre responder 401 para fallos de verificación JWT.
   */
  override handleRequest<TUser = AuthenticatedUser>(
    err: Error,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    void info;
    void context;
    void status;
    if (err || !user) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException();
    }
    return user;
  }
}
