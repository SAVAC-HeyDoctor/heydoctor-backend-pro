import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type LoggerService,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import { AuditLog } from '../audit/audit-log.entity';
import { AuditOutcome } from '../audit/audit-outcome.enum';
import {
  Subscription,
  SubscriptionPlan,
} from '../subscriptions/subscription.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { APP_LOGGER } from '../common/logger/logger.tokens';
import { ClinicService } from '../clinic/clinic.service';
import { UsersService } from '../users/users.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './types/jwt-payload.interface';

const REFRESH_TOKEN_DAYS = 7;
const MAX_ACTIVE_SESSIONS = 5;

function generateRawToken(): string {
  return randomBytes(32).toString('hex');
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Metadata extracted from the HTTP request by the controller. */
export type RequestContext = {
  ip: string | null;
  userAgent: string | null;
};

export type AuthUserView = {
  id: string;
  email: string;
  role: UserRole;
  clinicId: string | null;
};

export type MeResponse = {
  id: string;
  email: string;
  role: UserRole;
  clinicId: string;
  plan: SubscriptionPlan;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_LOGGER)
    private readonly logger: LoggerService,
    private readonly usersService: UsersService,
    private readonly clinicService: ClinicService,
    private readonly jwtService: JwtService,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  // ── Public Auth flows ─────────────────────────────────────────

  /**
   * Alta en una clínica ya existente: email único por `clinic_id`, password con bcrypt
   * (vía {@link UsersService.createUserForClinic}). Rol por defecto: admin.
   */
  async register(dto: RegisterDto) {
    const clinic = await this.clinicService.findById(dto.clinicId);
    if (!clinic) {
      throw new NotFoundException('Clinic not found');
    }

    const role = dto.role ?? UserRole.ADMIN;
    const user = await this.usersService.createUserForClinic(dto.clinicId, {
      email: dto.email,
      password: dto.password,
      role,
    });
    return this.buildAuthResponse(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    await this.usersService.changePassword(
      userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  async login(dto: LoginDto, ctx: RequestContext) {
    const user = await this.usersService.validateCredentials(
      dto.email,
      dto.password,
    );
    if (!user) {
      await this.logSecurityEvent('AUTH_LOGIN_FAILED', null, ctx, {
        email: dto.email,
        reason: 'invalid_credentials',
      });
      // App log: sin PII (email ya puede ir a audit DB vía logSecurityEvent si aplica)
      this.logger.warn('User login failed', {
        reason: 'invalid_credentials',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.logSecurityEvent('AUTH_LOGIN_SUCCESS', user.id, ctx);
    this.logger.log('User login success', {
      userId: user.id,
      clinicId: user.clinicId,
    });
    return this.buildAuthResponse(user);
  }

  private async buildAuthResponse(user: User) {
    const publicUser = this.toPublicUser(user);
    const payload: JwtPayload = {
      sub: publicUser.id,
      email: publicUser.email,
      role: publicUser.role,
      clinicId: publicUser.clinicId ?? null,
    };
    const access_token = await this.jwtService.signAsync(payload);
    return { access_token, user: publicUser };
  }

  // ── Refresh Token Management ──────────────────────────────────

  async createRefreshToken(
    userId: string,
    ctx: RequestContext,
  ): Promise<string> {
    await this.enforceSessionLimit(userId);

    const raw = generateRawToken();
    const tokenHash = hashToken(raw);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
    );

    const user = await this.usersService.findById(userId);
    if (!user?.clinicId) {
      throw new UnauthorizedException(
        'User has no clinic assigned; cannot create session',
      );
    }

    const entity = this.refreshTokenRepository.create({
      tokenHash,
      userId,
      clinicId: user.clinicId,
      expiresAt,
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent ? ctx.userAgent.slice(0, 512) : null,
    });
    await this.refreshTokenRepository.save(entity);

    return raw;
  }

  async validateAndRotateRefreshToken(
    rawToken: string,
    ctx: RequestContext,
  ): Promise<{ accessToken: string; newRefreshToken: string }> {
    const tokenHash = hashToken(rawToken);

    const stored = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
    });

    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // ── Reuse detection: revoked token used again → full revocation ──
    if (stored.revokedAt) {
      await this.revokeAllUserTokens(stored.userId);
      await this.logSecurityEvent(
        'TOKEN_REUSE_DETECTED',
        stored.userId,
        ctx,
        {
          tokenId: stored.id,
          originalRevokedAt: stored.revokedAt.toISOString(),
          severity: 'critical',
        },
      );
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Revoke current token (rotation)
    stored.revokedAt = new Date();
    stored.lastUsedAt = new Date();
    await this.refreshTokenRepository.save(stored);

    const user = await this.usersService.findById(stored.userId);
    if (!user || user.isActive === false) {
      throw new UnauthorizedException('User not found');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      clinicId: user.clinicId ?? null,
    };
    const accessToken = await this.jwtService.signAsync(payload);
    const newRefreshToken = await this.createRefreshToken(user.id, ctx);

    await this.logSecurityEvent('AUTH_REFRESH_SUCCESS', user.id, ctx, {
      previousTokenId: stored.id,
    });

    return { accessToken, newRefreshToken };
  }

  async revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const stored = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
    });
    if (stored && !stored.revokedAt) {
      stored.revokedAt = new Date();
      await this.refreshTokenRepository.save(stored);
    }
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  // ── Session limit enforcement ─────────────────────────────────

  private async enforceSessionLimit(userId: string): Promise<void> {
    const active = await this.refreshTokenRepository.find({
      where: {
        userId,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    if (active.length >= MAX_ACTIVE_SESSIONS) {
      const toRevoke = active.slice(MAX_ACTIVE_SESSIONS - 1);
      const now = new Date();
      for (const token of toRevoke) {
        token.revokedAt = now;
      }
      await this.refreshTokenRepository.save(toRevoke);
    }

    // Garbage-collect expired+revoked tokens older than 1 day
    await this.refreshTokenRepository
      .createQueryBuilder()
      .delete()
      .where('expires_at < :cutoff', {
        cutoff: new Date(Date.now() - 24 * 60 * 60 * 1000),
      })
      .andWhere('revoked_at IS NOT NULL')
      .execute();
  }

  // ── Security audit logging ────────────────────────────────────

  private async logSecurityEvent(
    action: string,
    userId: string | null,
    ctx: RequestContext,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const row = this.auditLogRepository.create({
        userId,
        action,
        resource: 'auth',
        status: action.includes('FAIL') || action.includes('REUSE')
          ? AuditOutcome.ERROR
          : AuditOutcome.SUCCESS,
        httpStatus: action.includes('FAIL') ? 401 : 200,
        metadata: {
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          ...extra,
        },
      });
      await this.auditLogRepository.save(row);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        'Unexpected error in AuthService.logSecurityEvent',
        error,
        { action, userId },
      );
    }
  }

  // ── /auth/me ──────────────────────────────────────────────────

  async getMe(userId: string): Promise<MeResponse> {
    const user = await this.usersService.findById(userId);
    if (!user || user.isActive === false) {
      throw new UnauthorizedException();
    }

    const subscription = await this.subscriptionRepository.findOne({
      where: { userId },
    });

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      clinicId: user.clinicId,
      plan: subscription?.plan ?? SubscriptionPlan.FREE,
    };
  }

  private toPublicUser(user: User): AuthUserView {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      clinicId: user.clinicId ?? null,
    };
  }
}
