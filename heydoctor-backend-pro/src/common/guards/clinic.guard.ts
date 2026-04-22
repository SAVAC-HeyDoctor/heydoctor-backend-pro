import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';

@Injectable()
export class ClinicGuard implements CanActivate {
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
      // Solo id y rol; sin email ni otros datos personales.
      console.error('User without clinicId', {
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
