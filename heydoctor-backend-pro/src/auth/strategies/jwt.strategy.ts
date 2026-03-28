import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../types/jwt-payload.interface';

/** Shape attached to `req.user` after JWT validation. */
export type AuthenticatedUser = JwtPayload;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    console.log('[ENV] JWT_SECRET (strategy):', secret ? 'SET' : 'MISSING');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret || 'MISSING_JWT_SECRET_PLACEHOLDER',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.email !== payload.email || user.role !== payload.role) {
      throw new UnauthorizedException();
    }
    return {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
