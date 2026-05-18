import {
  CanActivate,
  ContextType,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  type LoggerService,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';
import { APP_LOGGER } from '../logger/logger.tokens';
import type { Request } from 'express';

function authRequestMeta(context: ExecutionContext): {
  method: string | null;
  path: string | null;
  isAuthPath: boolean;
} {
  if (context.getType<ContextType>() !== 'http') {
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
export class ClinicGuard implements CanActivate {
  constructor(@Inject(APP_LOGGER) private readonly logger: LoggerService) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }
    const meta = authRequestMeta(context);

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    // Sin usuario: ruta pública o JWT aún no aplica; JwtAuthGuard rechaza lo protegido.
    if (!user) {
      if (meta.isAuthPath) {
        this.logger.log('auth_pipeline_guard', {
          event: 'auth_pipeline_guard',
          guard: 'ClinicGuard',
          decision: 'skip_no_user',
          method: meta.method,
          path: meta.path,
        });
      }
      return true;
    }

    const clinicId = user.clinicId;
    if (
      clinicId === null ||
      clinicId === undefined ||
      String(clinicId).trim() === ''
    ) {
      this.logger.error('clinic_guard_no_clinic', {
        event: 'clinic_guard_no_clinic',
        sub: user.sub,
        role: user.role,
      });
      throw new ForbiddenException(
        'User has no clinic assigned. Contact support.',
      );
    }

    if (meta.isAuthPath) {
      this.logger.log('auth_pipeline_guard', {
        event: 'auth_pipeline_guard',
        guard: 'ClinicGuard',
        decision: 'allow',
        method: meta.method,
        path: meta.path,
        userId: user.sub,
      });
    }
    return true;
  }
}
