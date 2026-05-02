import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  type LoggerService,
} from '@nestjs/common';
import { CSRF_COOKIE } from '../common/csrf/csrf.constants';
import { Throttle } from '@nestjs/throttler';
import { getCurrentRequestId } from '../common/request-context.storage';
import { APP_LOGGER } from '../common/logger/logger.tokens';
import type { Request, Response } from 'express';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  AuthService,
  type MeResponse,
  type RequestContext,
} from './auth.service';
import type { AuthenticatedUser } from './strategies/jwt.strategy';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE_MS,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE_MS,
  SESSION_COOKIE_PATH,
  authCookieBase,
  getSessionCookieOptions,
} from './auth-cookies';
import { clearCsrfCookie, setCsrfCookie } from '../common/csrf/csrf-cookie';

function setAccessCookie(res: Response, token: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE, token, {
    ...getSessionCookieOptions(),
    path: SESSION_COOKIE_PATH,
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
  });
}

function clearAccessCookie(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, authCookieBase(SESSION_COOKIE_PATH));
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, token, {
    ...getSessionCookieOptions(),
    path: SESSION_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, authCookieBase(SESSION_COOKIE_PATH));
}

function readCookie(req: Request, name: string): string | undefined {
  const v: unknown = req.cookies?.[name];
  return typeof v === 'string' ? v : undefined;
}

function isPublicRegistrationAllowed(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  return process.env.ENABLE_PUBLIC_REGISTRATION === 'true';
}

function extractContext(req: Request): RequestContext {
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : (req.ip ?? null);
  const uaRaw = req.headers['user-agent'];
  const userAgent =
    typeof uaRaw === 'string'
      ? uaRaw
      : Array.isArray(uaRaw)
        ? (uaRaw[0] ?? null)
        : null;
  return { ip, userAgent };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(APP_LOGGER)
    private readonly logger: LoggerService,
  ) {}

  /**
   * SPA cross-origin (p. ej. Vercel → API): el JS no puede leer `csrf_token` del dominio del API.
   * Devuelve el valor actual o crea cookie + token para enviarlo en `X-CSRF-Token` en POST/PATCH/DELETE.
   */
  @Public()
  @Get('csrf')
  @HttpCode(HttpStatus.OK)
  csrfBootstrap(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const existing = readCookie(req, CSRF_COOKIE);
    if (existing && existing.length >= 16) {
      return { csrfToken: existing };
    }
    const csrfToken = setCsrfCookie(res);
    return { csrfToken };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<MeResponse> {
    this.logger.log('auth_me_request', {
      event: 'auth_me',
      userId: user.sub,
      clinicId: user.clinicId ?? null,
      requestId: getCurrentRequestId(),
      path: req.path,
      authHeaderPresent: Boolean(req.headers.authorization),
      accessCookiePresent: readCookie(req, ACCESS_TOKEN_COOKIE) !== undefined,
    });
    return this.authService.getMe(user.sub);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ ok: true }> {
    await this.authService.changePassword(user.sub, dto);
    return { ok: true };
  }

  /**
   * En `production`, solo si `ENABLE_PUBLIC_REGISTRATION=true`.
   * Respuesta: `{ user, csrfToken }`; tokens vía Set-Cookie HttpOnly; `csrfToken` para cabecera `X-CSRF-Token` en cross-origin.
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!isPublicRegistrationAllowed()) {
      throw new ForbiddenException('Public registration is disabled');
    }
    const ctx = extractContext(req);
    const result = await this.authService.register(dto);
    const refreshToken = await this.authService.createRefreshToken(
      result.user.id,
      ctx,
    );
    setRefreshCookie(res, refreshToken);
    setAccessCookie(res, result.access_token);
    const csrfToken = setCsrfCookie(res);
    return { user: result.user, csrfToken };
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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
    setAccessCookie(res, result.access_token);
    const csrfToken = setCsrfCookie(res);
    return { user: result.user, csrfToken };
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const rawToken = readCookie(req, REFRESH_TOKEN_COOKIE);
    if (!rawToken) {
      throw new UnauthorizedException('No refresh token');
    }

    const ctx = extractContext(req);
    const { accessToken, newRefreshToken } =
      await this.authService.validateAndRotateRefreshToken(rawToken, ctx);

    setRefreshCookie(res, newRefreshToken);
    setAccessCookie(res, accessToken);
    const csrfToken = setCsrfCookie(res);
    return { ok: true as const, csrfToken };
  }

  @Public()
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const rawToken = readCookie(req, REFRESH_TOKEN_COOKIE);
    if (rawToken) {
      await this.authService.revokeRefreshToken(rawToken);
    }
    clearRefreshCookie(res);
    clearAccessCookie(res);
    clearCsrfCookie(res);
    return { ok: true };
  }
}
