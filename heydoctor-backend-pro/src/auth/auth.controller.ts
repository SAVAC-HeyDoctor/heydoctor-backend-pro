import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  AuthService,
  type MeResponse,
  type RequestContext,
} from './auth.service';
import type { AuthenticatedUser } from './strategies/jwt.strategy';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_COOKIE = 'refresh_token';

function cookieOptions(
  isProduction: boolean,
): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'none' | 'lax';
  path: string;
} {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/auth',
  };
}

function setRefreshCookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(REFRESH_COOKIE, token, {
    ...cookieOptions(isProd),
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
}

function clearRefreshCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(REFRESH_COOKIE, cookieOptions(isProd));
}

function extractContext(req: Request): RequestContext {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : (req.ip ?? null);
  const userAgent =
    (req.headers['user-agent'] as string | undefined) ?? null;
  return { ip, userAgent };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<MeResponse> {
    return this.authService.getMe(user.sub);
  }

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx = extractContext(req);
    const result = await this.authService.register(dto);
    const refreshToken = await this.authService.createRefreshToken(
      result.user.id,
      ctx,
    );
    setRefreshCookie(res, refreshToken);
    return { access_token: result.access_token, user: result.user };
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx = extractContext(req);
    const result = await this.authService.login(dto, ctx);
    const refreshToken = await this.authService.createRefreshToken(
      result.user.id,
      ctx,
    );
    setRefreshCookie(res, refreshToken);
    return { access_token: result.access_token, user: result.user };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (!rawToken) {
      throw new UnauthorizedException('No refresh token');
    }

    const ctx = extractContext(req);
    const { accessToken, newRefreshToken } =
      await this.authService.validateAndRotateRefreshToken(rawToken, ctx);

    setRefreshCookie(res, newRefreshToken);
    return { access_token: accessToken };
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = req.cookies?.[REFRESH_COOKIE];
    if (rawToken) {
      await this.authService.revokeRefreshToken(rawToken);
    }
    clearRefreshCookie(res);
    return { ok: true };
  }
}
