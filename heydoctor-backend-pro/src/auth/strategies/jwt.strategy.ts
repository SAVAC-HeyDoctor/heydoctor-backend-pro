import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
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

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(config),
    });
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
    const key = getJwtUserCacheKey(payload.sub);
    const cached = await this.cache.get<AuthenticatedUser>(key);
    if (cached) {
      if (!this.claimsMatchDb(cached.email, cached.role as UserRole, payload)) {
        throw new UnauthorizedException();
      }
      const active = await this.usersService.isUserActive(payload.sub);
      if (!active) {
        throw new UnauthorizedException();
      }
      return cached;
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.isActive === false) {
      throw new UnauthorizedException();
    }
    if (!this.claimsMatchDb(user.email, user.role, payload)) {
      throw new UnauthorizedException();
    }
    const validated: AuthenticatedUser = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    await this.cache.set(key, validated, JWT_USER_CACHE_TTL_MS);
    return validated;
  }
}
