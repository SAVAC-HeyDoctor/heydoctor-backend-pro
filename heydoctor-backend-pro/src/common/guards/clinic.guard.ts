import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  type LoggerService,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';
import { APP_LOGGER } from '../logger/logger.tokens';

@Injectable()
export class ClinicGuard implements CanActivate {
  constructor(@Inject(APP_LOGGER) private readonly logger: LoggerService) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    // Sin usuario: ruta pública o JWT aún no aplica; JwtAuthGuard rechaza lo protegido.
    if (!user) {
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

    return true;
  }
}
