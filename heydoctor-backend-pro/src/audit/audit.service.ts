import { Inject, Injectable, type LoggerService } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { assignClinic } from '../common/entity-clinic.util';
import { APP_LOGGER } from '../common/logger/logger.tokens';
import { Clinic } from '../clinic/clinic.entity';
import { AuditLog } from './audit-log.entity';
import { AuditOutcome } from './audit-outcome.enum';
import type {
  AuditLogErrorPayload,
  AuditLogSuccessPayload,
} from './audit.types';
import {
  shouldEmitAuditPersistErrorLog,
  shouldEmitAuditPersistSuccessLog,
} from './audit-app-log.policy';

/** Tunables for in-memory alert heuristics (see handlers below). */
const ALERT_CONFIG = {
  SHORT_WINDOW_MS: 5 * 60 * 1000,
  MAX_403_PER_USER: 5,
  /** Global CONSULTATION_STATUS_CHANGE events allowed in window before warn. */
  MAX_STATUS_CHANGES: 25,
} as const;

/** Warn when crossing strictly above MAX (e.g. 6th 403 when MAX is 5). */
const abuseWarnAt = ALERT_CONFIG.MAX_403_PER_USER + 1;
const statusChangeWarnAt = ALERT_CONFIG.MAX_STATUS_CHANGES + 1;

/** Context passed to alert handlers after a persisted audit row. */
export type AuditAlertLogContext = {
  userId?: string | null;
  httpStatus: number;
  action: string;
};

/** Optional filters for compliance CSV export. */
export type AuditExportFilters = {
  clinicId?: string;
  action?: string;
  fromDate?: string;
  toDate?: string;
};

@Injectable()
export class AuditService {
  /*
   * TODO (pro): audit write buffering — enqueue logSuccess/logError payloads in memory or Redis,
   * flush every N seconds via @nestjs/schedule + batch insert (TypeORM save(Array)), to reduce DB
   * write amplification under traffic spikes. On shutdown, flush remaining queue; size-cap the
   * buffer to avoid OOM. Trade-off: short window where logs are not yet queryable after a crash.
   *
   * TODO (scale): async app logging — ship structured lines to a worker/buffer so hot paths do not
   * block on I/O; batch before send to stdout/OTel. Not implemented to keep behaviour predictable.
   */

  // TODO: Replace in-memory counters with Redis (or similar) for multi-instance environments
  // so thresholds are shared across pods and survive process restarts.
  private readonly user403Timestamps = new Map<string, number[]>();
  private readonly statusChangeTimestamps: number[] = [];

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogsRepository: Repository<AuditLog>,
    @InjectRepository(Clinic)
    private readonly clinicsRepository: Repository<Clinic>,
    @Inject(APP_LOGGER)
    private readonly logger: LoggerService,
  ) {}

  /** Si no viene clínica (p. ej. webhook sin contexto), usa la clínica más antigua. */
  private async resolveClinicIdForAudit(
    explicit: string | null | undefined,
  ): Promise<string> {
    if (explicit != null && String(explicit).trim() !== '') {
      return explicit;
    }
    const row = await this.clinicsRepository.find({
      order: { createdAt: 'ASC' },
      take: 1,
      select: { id: true },
    });
    const id = row[0]?.id;
    if (!id) {
      throw new Error('Audit: no hay clínicas en BD para asignar clinic_id');
    }
    return id;
  }

  /**
   * Returns audit rows for reporting (ordered by time ascending).
   * Large result sets are not paginated; consider adding limits in production.
   */
  async findLogsForExport(filters: AuditExportFilters): Promise<AuditLog[]> {
    const qb = this.auditLogsRepository
      .createQueryBuilder('log')
      .select([
        'log.userId',
        'log.action',
        'log.resource',
        'log.resourceId',
        'log.clinicId',
        'log.status',
        'log.httpStatus',
        'log.createdAt',
      ])
      .orderBy('log.createdAt', 'ASC');

    if (filters.clinicId !== undefined) {
      qb.andWhere('log.clinicId = :clinicId', { clinicId: filters.clinicId });
    }
    if (filters.action !== undefined && filters.action !== '') {
      qb.andWhere('log.action = :action', { action: filters.action });
    }
    if (filters.fromDate !== undefined) {
      qb.andWhere('log.createdAt >= :fromDate', {
        fromDate: new Date(filters.fromDate),
      });
    }
    if (filters.toDate !== undefined) {
      qb.andWhere('log.createdAt <= :toDate', {
        toDate: new Date(filters.toDate),
      });
    }

    return qb.getMany();
  }

  async logSuccess(data: AuditLogSuccessPayload): Promise<void> {
    try {
      const clinicId = await this.resolveClinicIdForAudit(data.clinicId);
      const row = this.auditLogsRepository.create({
        userId: data.userId ?? null,
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId ?? null,
        status: AuditOutcome.SUCCESS,
        httpStatus: data.httpStatus,
        errorMessage: null,
        metadata: data.metadata ?? null,
      });
      assignClinic(row, clinicId);
      await this.auditLogsRepository.save(row);
      if (shouldEmitAuditPersistSuccessLog(data.action)) {
        this.logger.log('Audit log created', {
          action: data.action,
          userId: data.userId ?? undefined,
          clinicId,
        });
      }
      const log: AuditAlertLogContext = {
        userId: data.userId,
        httpStatus: data.httpStatus,
        action: data.action,
      };
      this.handle403Alerts(log);
      this.handleStatusChangeAlerts(log);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error('AuditService.logSuccess failed', error, {
        action: data.action,
        userId: data.userId,
        clinicId: data.clinicId,
      });
    }
  }

  async logError(data: AuditLogErrorPayload): Promise<void> {
    try {
      const clinicId = await this.resolveClinicIdForAudit(data.clinicId);
      const row = this.auditLogsRepository.create({
        userId: data.userId ?? null,
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId ?? null,
        status: AuditOutcome.ERROR,
        httpStatus: data.httpStatus,
        errorMessage: data.errorMessage,
        metadata: data.metadata ?? null,
      });
      assignClinic(row, clinicId);
      await this.auditLogsRepository.save(row);
      if (shouldEmitAuditPersistErrorLog()) {
        this.logger.log('Audit log created', {
          action: data.action,
          userId: data.userId ?? undefined,
          clinicId,
        });
      }
      const log: AuditAlertLogContext = {
        userId: data.userId,
        httpStatus: data.httpStatus,
        action: data.action,
      };
      this.handle403Alerts(log);
      this.handleStatusChangeAlerts(log);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error('AuditService.logError failed', error, {
        action: data.action,
        userId: data.userId,
        clinicId: data.clinicId,
      });
    }
  }

  private pruneWindow(timestamps: number[]): number[] {
    const cutoff = Date.now() - ALERT_CONFIG.SHORT_WINDOW_MS;
    return timestamps.filter((t) => t >= cutoff);
  }

  /**
   * Tracks HTTP 403 audit events per user in a sliding window.
   * TODO: Swap Map + arrays for Redis INCR + EXPIRE or sorted sets for horizontal scale.
   */
  private handle403Alerts(log: AuditAlertLogContext): void {
    if (log.httpStatus !== 403 || !log.userId) {
      return;
    }

    const list = this.user403Timestamps.get(log.userId) ?? [];
    list.push(Date.now());
    const pruned = this.pruneWindow(list);
    this.user403Timestamps.set(log.userId, pruned);

    if (pruned.length === abuseWarnAt) {
      this.logger.warn('Potential abuse detected', {
        userId: log.userId,
      });
    }
  }

  /**
   * Tracks CONSULTATION_STATUS_CHANGE volume globally in a sliding window.
   * TODO: Use Redis for cluster-wide rate detection; optionally scope by clinicId from log extensions.
   */
  private handleStatusChangeAlerts(log: AuditAlertLogContext): void {
    if (log.action !== 'CONSULTATION_STATUS_CHANGE') {
      return;
    }

    this.statusChangeTimestamps.push(Date.now());
    const pruned = this.pruneWindow(this.statusChangeTimestamps);
    this.statusChangeTimestamps.length = 0;
    this.statusChangeTimestamps.push(...pruned);

    if (pruned.length === statusChangeWarnAt) {
      this.logger.warn('Unusual consultation status change volume', {
        action: 'CONSULTATION_STATUS_CHANGE',
        windowEvents: pruned.length,
      });
    }
  }
}
