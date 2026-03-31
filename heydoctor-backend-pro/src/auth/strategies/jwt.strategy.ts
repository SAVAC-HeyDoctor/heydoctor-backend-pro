import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Cache } from 'cache-manager';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { getJwtUserCacheKey } from '../jwt-user-cache.constants';
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
    const secret = config.get<string>('JWT_SECRET')?.trim();
    if (!secret) {
      throw new Error('JWT_SECRET is required');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const key = getJwtUserCacheKey(payload.sub);
    const cached = await this.cache.get<AuthenticatedUser>(key);
    if (cached) {
      if (cached.email !== payload.email || cached.role !== payload.role) {
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
    if (user.email !== payload.email || user.role !== payload.role) {
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
