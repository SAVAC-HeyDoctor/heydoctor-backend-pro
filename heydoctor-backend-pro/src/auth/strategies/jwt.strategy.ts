import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Cache } from 'cache-manager';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '../../users/user-role.enum';
import { UsersService } from '../../users/users.service';
import { getJwtUserCacheKey } from '../jwt-user-cache.constants';
import { resolveJwtSecret } from '../jwt-secret.util';
import { JwtPayload } from '../types/jwt-payload.interface';

/** Shape attached to `req.user` after JWT validation. */
export type AuthenticatedUser = JwtPayload;

const JWT_USER_CACHE_TTL_MS = 5 * 60 * 1000;

type JwtValidateFailReason =
  | 'user_not_found'
  | 'inactive'
  | 'claims_mismatch';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(configService),
    });
  }

  private isJwtDebug(): boolean {
    return this.configService.get<string>('JWT_DEBUG')?.toLowerCase() === 'true';
  }

  /**
   * Fallos de verificación del token (firma, expiración, formato) antes de `validate()`.
   * Sin tokens ni secretos en log.
   */
  handleRequest(
    err: Error | undefined,
    user: AuthenticatedUser | false,
    info: unknown,
  ): AuthenticatedUser {
    if (err || !user) {
      const fromInfo =
        info && typeof info === 'object' && info !== null
          ? (info as { message?: string; name?: string })
          : undefined;
      this.logger.warn('[JWT VERIFY FAIL]', {
        error: fromInfo?.message ?? err?.message ?? 'unknown',
        type: fromInfo?.name ?? err?.name,
      });
      throw err ?? new UnauthorizedException();
    }
    return user;
  }

  private throwValidateFail(
    reason: JwtValidateFailReason,
    sub: string | undefined,
  ): never {
    this.logger.warn('[JWT VALIDATE FAIL]', { reason, sub });
    throw new UnauthorizedException();
  }

  /** Claims en JWT son JSON; la DB puede devolver enum — normalizar antes de comparar. */
  private claimsMatchDb(
    email: string,
    role: UserRole,
    payload: JwtPayload,
  ): boolean {
    const pEmail = String(payload.email ?? '')
      .toLowerCase()
      .trim();
    const pRole = String(payload.role ?? '').trim();
    return (
      email.toLowerCase().trim() === pEmail && String(role) === pRole
    );
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (this.isJwtDebug()) {
      this.logger.debug('[JWT VALIDATE] payload recibido', {
        sub: payload?.sub,
        email: payload?.email,
        role: payload?.role,
      });
    }

    const key = getJwtUserCacheKey(payload.sub);
    const cached = await this.cache.get<AuthenticatedUser>(key);
    if (cached) {
      if (!this.claimsMatchDb(cached.email, cached.role as UserRole, payload)) {
        this.throwValidateFail('claims_mismatch', payload?.sub);
      }
      const active = await this.usersService.isUserActive(payload.sub);
      if (!active) {
        this.throwValidateFail('inactive', payload?.sub);
      }
      return cached;
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      this.throwValidateFail('user_not_found', payload?.sub);
    }
    if (user.isActive === false) {
      this.throwValidateFail('inactive', payload?.sub);
    }
    if (!this.claimsMatchDb(user.email, user.role, payload)) {
      this.throwValidateFail('claims_mismatch', payload?.sub);
    }
    const validated: AuthenticatedUser = {
      sub: user.id,
      email: user.email,
      role: user.role,
      clinicId: user.clinicId ?? null,
    };
    await this.cache.set(key, validated, JWT_USER_CACHE_TTL_MS);
    return validated;
  }
}
