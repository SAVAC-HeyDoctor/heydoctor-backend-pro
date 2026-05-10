import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import {
  SubscriptionChangeSource,
  SubscriptionChangeReasonCode,
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
  planGrantedForTier,
} from './subscription.entity';
import {
  SubscriptionEventSource,
  SubscriptionEventType,
} from './subscription-event.entity';
import { SubscriptionEventsService } from './subscription-events.service';
import { assignClinic } from '../common/entity-clinic.util';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { normalizeReasonCode } from './reason-normalizer';

const PLAN_RANK: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.FREE]: 0,
  [SubscriptionPlan.PRO]: 1,
};

function sanitizeReason(reason?: string): string | undefined {
  if (typeof reason !== 'string') return undefined;
  const clean = reason.trim();
  return clean.length > 0 ? clean : undefined;
}

function subscriptionEventSourceFromChangeSource(
  source: SubscriptionChangeSource,
): SubscriptionEventSource {
  switch (source) {
    case SubscriptionChangeSource.ADMIN_PANEL:
      return SubscriptionEventSource.ADMIN;
    case SubscriptionChangeSource.WEBHOOK:
    case SubscriptionChangeSource.PAYKU:
      return SubscriptionEventSource.WEBHOOK;
    default:
      return SubscriptionEventSource.SYSTEM;
  }
}

function parseProMonthlyPrice(cfg: ConfigService): number {
  const v = cfg.get<string>('SUBSCRIPTION_PRO_MONTHLY_PRICE');
  const n = Number(v ?? '0');
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Un ciclo mensual recurrente desde `from` (mismo día UTC +1 mes aprox.). */
function utcAddOneBillingMonth(from: Date): Date {
  return new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth() + 1,
      from.getUTCDate(),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

/** Campos recurrentes cuando pasa a PRO o se resetean en FREE — no afecta planGrantedForTier. */
function applySubscriptionBillingCycle(
  row: Subscription,
  plan: SubscriptionPlan,
  cfg: ConfigService,
): void {
  if (plan === SubscriptionPlan.PRO) {
    const amt = parseProMonthlyPrice(cfg);
    row.price = amt.toFixed(2);
    const start = new Date();
    row.currentPeriodStart = start;
    row.currentPeriodEnd = utcAddOneBillingMonth(start);
    return;
  }
  row.price = '0.00';
  row.currentPeriodStart = null;
  row.currentPeriodEnd = null;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionsRepository: Repository<Subscription>,
    private readonly auditService: AuditService,
    private readonly usersService: UsersService,
    private readonly subscriptionEventsService: SubscriptionEventsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Backward-compatible default:
   * if user has no subscription row yet, create ACTIVE/FREE automatically.
   */
  async getOrCreateForUser(userId: string): Promise<Subscription> {
    const existing = await this.subscriptionsRepository.findOne({
      where: { userId },
    });
    if (existing) return existing;

    const user = await this.usersService.findById(userId);
    if (!user?.clinicId) {
      throw new BadRequestException(
        'User has no clinic assigned; cannot create subscription',
      );
    }

    const created = this.subscriptionsRepository.create({
      userId,
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.ACTIVE,
    });
    assignClinic(created, user.clinicId);
    try {
      const saved = await this.subscriptionsRepository.save(created);
      try {
        await this.subscriptionEventsService.append({
          userId,
          clinicId: user.clinicId,
          eventType: SubscriptionEventType.SUBSCRIPTION_CREATED,
          newPlan: SubscriptionPlan.FREE,
          newStatus: SubscriptionStatus.ACTIVE,
          source: SubscriptionEventSource.SYSTEM,
          metadata: { reason: 'first_subscription_row' },
        });
      } catch (err) {
        this.logger.error(
          'subscription_event_SUBSCRIPTION_CREATED_failed',
          err instanceof Error ? err : new Error(String(err)),
        );
      }
      return saved;
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        (e as { driverError?: { code?: string } }).driverError?.code === '23505'
      ) {
        const raced = await this.subscriptionsRepository.findOne({
          where: { userId },
        });
        if (raced) return raced;
      }
      throw e;
    }
  }

  async getOrCreateForUserWithManager(
    manager: EntityManager,
    userId: string,
  ): Promise<Subscription> {
    const repo = manager.getRepository(Subscription);
    const existing = await repo.findOne({
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing) return existing;

    const user = await manager.getRepository(User).findOne({
      where: { id: userId },
    });
    if (!user?.clinicId) {
      throw new BadRequestException(
        'User has no clinic assigned; cannot create subscription',
      );
    }

    const created = repo.create({
      userId,
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.ACTIVE,
    });
    assignClinic(created, user.clinicId);

    try {
      const saved = await repo.save(created);
      await this.subscriptionEventsService.appendWithManager(manager, {
        userId,
        clinicId: user.clinicId,
        eventType: SubscriptionEventType.SUBSCRIPTION_CREATED,
        newPlan: SubscriptionPlan.FREE,
        newStatus: SubscriptionStatus.ACTIVE,
        source: SubscriptionEventSource.SYSTEM,
        metadata: { reason: 'first_subscription_row' },
      });
      return saved;
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        (e as { driverError?: { code?: string } }).driverError?.code === '23505'
      ) {
        const raced = await repo.findOne({
          where: { userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (raced) return raced;
      }
      throw e;
    }
  }

  async findExistingByUserId(userId: string): Promise<Subscription | null> {
    return this.subscriptionsRepository.findOne({ where: { userId } });
  }

  async findExistingByUserIdWithManager(
    manager: EntityManager,
    userId: string,
  ): Promise<Subscription | null> {
    return manager.getRepository(Subscription).findOne({
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  async hasRequiredPlan(
    userId: string,
    requiredPlan: SubscriptionPlan,
  ): Promise<boolean> {
    const subscription = await this.getOrCreateForUser(userId);
    const effective = planGrantedForTier(subscription);
    return PLAN_RANK[effective] >= PLAN_RANK[requiredPlan];
  }

  async listAll(): Promise<Subscription[]> {
    return this.subscriptionsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async updatePlan(
    userId: string,
    plan: SubscriptionPlan,
    authUser: AuthenticatedUser,
    source: SubscriptionChangeSource = SubscriptionChangeSource.ADMIN_PANEL,
    reason?: string,
    reasonCode?: SubscriptionChangeReasonCode,
    reasonText?: string,
  ): Promise<Subscription> {
    const existing = await this.getOrCreateForUser(userId);
    const previousPlan = existing.plan;

    if (previousPlan === plan) {
      return existing;
    }

    existing.plan = plan;
    applySubscriptionBillingCycle(existing, plan, this.configService);

    const saved = await this.subscriptionsRepository.save(existing);
    const auditReason = sanitizeReason(reason);
    const auditReasonText = sanitizeReason(reasonText);
    const effectiveReasonCode =
      reasonCode ?? normalizeReasonCode(auditReasonText);

    // Audit is best-effort: failure should never break admin operation.
    void this.auditService.logSuccess({
      action: 'SUBSCRIPTION_PLAN_CHANGED',
      resource: 'subscription',
      resourceId: saved.id,
      userId,
      clinicId: saved.clinicId,
      httpStatus: 200,
      metadata: {
        from: previousPlan,
        to: plan,
        changedBy: authUser.sub,
        source,
        type: 'plan_change',
        ...(auditReason ? { reason: auditReason } : {}),
        ...(effectiveReasonCode ? { reasonCode: effectiveReasonCode } : {}),
        ...(auditReasonText ? { reasonText: auditReasonText } : {}),
      },
    });

    if (source === SubscriptionChangeSource.ADMIN_PANEL) {
      try {
        await this.subscriptionEventsService.append({
          userId,
          clinicId: saved.clinicId,
          eventType: SubscriptionEventType.ADMIN_UPDATED,
          previousPlan,
          newPlan: plan,
          previousStatus: existing.status,
          newStatus: saved.status,
          source: SubscriptionEventSource.ADMIN,
          metadata: {
            changedBy: authUser.sub,
            ...(auditReason ? { reason: auditReason } : {}),
            ...(effectiveReasonCode ? { reasonCode: effectiveReasonCode } : {}),
            ...(auditReasonText ? { reasonText: auditReasonText } : {}),
          },
        });
      } catch (err) {
        this.logger.error(
          'subscription_event_ADMIN_UPDATED_failed',
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }

    if (
      previousPlan !== plan &&
      source !== SubscriptionChangeSource.ADMIN_PANEL
    ) {
      const upgraded = PLAN_RANK[plan] > PLAN_RANK[previousPlan];
      try {
        await this.subscriptionEventsService.append({
          userId,
          clinicId: saved.clinicId,
          eventType: upgraded
            ? SubscriptionEventType.PLAN_UPGRADED
            : SubscriptionEventType.PLAN_DOWNGRADED,
          previousPlan,
          newPlan: plan,
          previousStatus: existing.status,
          newStatus: saved.status,
          source: subscriptionEventSourceFromChangeSource(source),
          metadata: auditReason ? { reason: auditReason } : {},
        });
      } catch (err) {
        this.logger.error(
          'subscription_event_PLAN_RANK_change_failed',
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }

    return saved;
  }

  async updatePlanWithManager(
    manager: EntityManager,
    userId: string,
    plan: SubscriptionPlan,
    authUser: AuthenticatedUser,
    source: SubscriptionChangeSource = SubscriptionChangeSource.ADMIN_PANEL,
    reason?: string,
    reasonCode?: SubscriptionChangeReasonCode,
    reasonText?: string,
  ): Promise<Subscription> {
    const repo = manager.getRepository(Subscription);
    const existing = await this.getOrCreateForUserWithManager(manager, userId);
    const previousPlan = existing.plan;

    if (previousPlan === plan) {
      return existing;
    }

    existing.plan = plan;
    applySubscriptionBillingCycle(existing, plan, this.configService);

    const saved = await repo.save(existing);
    const auditReason = sanitizeReason(reason);
    const auditReasonText = sanitizeReason(reasonText);
    const effectiveReasonCode =
      reasonCode ?? normalizeReasonCode(auditReasonText);

    if (source === SubscriptionChangeSource.ADMIN_PANEL) {
      await this.subscriptionEventsService.appendWithManager(manager, {
        userId,
        clinicId: saved.clinicId,
        eventType: SubscriptionEventType.ADMIN_UPDATED,
        previousPlan,
        newPlan: plan,
        previousStatus: existing.status,
        newStatus: saved.status,
        source: SubscriptionEventSource.ADMIN,
        metadata: {
          changedBy: authUser.sub,
          ...(auditReason ? { reason: auditReason } : {}),
          ...(effectiveReasonCode ? { reasonCode: effectiveReasonCode } : {}),
          ...(auditReasonText ? { reasonText: auditReasonText } : {}),
        },
      });
    }

    if (
      previousPlan !== plan &&
      source !== SubscriptionChangeSource.ADMIN_PANEL
    ) {
      const upgraded = PLAN_RANK[plan] > PLAN_RANK[previousPlan];
      await this.subscriptionEventsService.appendWithManager(manager, {
        userId,
        clinicId: saved.clinicId,
        eventType: upgraded
          ? SubscriptionEventType.PLAN_UPGRADED
          : SubscriptionEventType.PLAN_DOWNGRADED,
        previousPlan,
        newPlan: plan,
        previousStatus: existing.status,
        newStatus: saved.status,
        source: subscriptionEventSourceFromChangeSource(source),
        metadata: auditReason ? { reason: auditReason } : {},
      });
    }

    return saved;
  }

  /**
   * Cambia solo el estado (active/inactive). Emite eventos analíticos; no usa eventos para gating.
   * `reason` puede indicar expiración (p. ej. "expired") para registrar SUBSCRIPTION_EXPIRED.
   */
  async updateSubscriptionStatus(
    userId: string,
    status: SubscriptionStatus,
    authUser: AuthenticatedUser,
    reason?: string,
  ): Promise<Subscription> {
    const existing = await this.getOrCreateForUser(userId);
    const previousPlan = existing.plan;
    const previousStatus = existing.status;

    if (existing.status === status) {
      return existing;
    }

    existing.status = status;
    const saved = await this.subscriptionsRepository.save(existing);
    const saneReason = sanitizeReason(reason);

    void this.auditService.logSuccess({
      action: 'SUBSCRIPTION_STATUS_CHANGED',
      resource: 'subscription',
      resourceId: saved.id,
      userId,
      clinicId: saved.clinicId,
      httpStatus: 200,
      metadata: {
        from: previousStatus,
        to: status,
        changedBy: authUser.sub,
        source: SubscriptionChangeSource.ADMIN_PANEL,
        ...(saneReason ? { reason: saneReason } : {}),
      },
    });

    const reasonLower = (saneReason ?? '').toLowerCase();
    const isExpiredSemantics =
      reasonLower.includes('expir') ||
      reasonLower.includes('expire') ||
      reasonLower.includes('caduc');

    try {
      if (
        previousStatus === SubscriptionStatus.ACTIVE &&
        status === SubscriptionStatus.INACTIVE
      ) {
        const eventType = isExpiredSemantics
          ? SubscriptionEventType.SUBSCRIPTION_EXPIRED
          : SubscriptionEventType.SUBSCRIPTION_DEACTIVATED;
        await this.subscriptionEventsService.append({
          userId,
          clinicId: saved.clinicId,
          eventType,
          previousPlan,
          newPlan: saved.plan,
          previousStatus,
          newStatus: saved.status,
          source: SubscriptionEventSource.ADMIN,
          metadata: {
            changedBy: authUser.sub,
            ...(saneReason ? { reason: saneReason } : {}),
          },
        });
      } else if (
        previousStatus === SubscriptionStatus.INACTIVE &&
        status === SubscriptionStatus.ACTIVE
      ) {
        await this.subscriptionEventsService.append({
          userId,
          clinicId: saved.clinicId,
          eventType: SubscriptionEventType.SUBSCRIPTION_REACTIVATED,
          previousPlan,
          newPlan: saved.plan,
          previousStatus,
          newStatus: saved.status,
          source: SubscriptionEventSource.ADMIN,
          metadata: {
            changedBy: authUser.sub,
            ...(saneReason ? { reason: saneReason } : {}),
          },
        });
      }
    } catch (err) {
      this.logger.error(
        'subscription_event_status_transition_failed',
        err instanceof Error ? err : new Error(String(err)),
      );
    }

    return saved;
  }
}
