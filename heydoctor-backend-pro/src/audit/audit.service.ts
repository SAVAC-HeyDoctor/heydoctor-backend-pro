import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditOutcome } from './audit-outcome.enum';
import type { AuditLogErrorPayload, AuditLogSuccessPayload } from './audit.types';

/** Sliding window for in-memory alert heuristics (no Redis). */
const SHORT_WINDOW_MS = 5 * 60 * 1000;
const MAX_403_PER_USER = 5;
/** Fires when crossing this count (i.e. 6th 403 within the window). */
const ABUSE_WARN_AT = MAX_403_PER_USER + 1;
const MAX_STATUS_CHANGES_IN_WINDOW = 25;
const STATUS_CHANGE_WARN_AT = MAX_STATUS_CHANGES_IN_WINDOW + 1;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  private readonly user403Timestamps = new Map<string, number[]>();
  private readonly statusChangeTimestamps: number[] = [];

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogsRepository: Repository<AuditLog>,
  ) {}

  async logSuccess(data: AuditLogSuccessPayload): Promise<void> {
    try {
      const row = this.auditLogsRepository.create({
        userId: data.userId ?? null,
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId ?? null,
        clinicId: data.clinicId ?? null,
        status: AuditOutcome.SUCCESS,
        httpStatus: data.httpStatus,
        errorMessage: null,
        metadata: data.metadata ?? null,
      });
      await this.auditLogsRepository.save(row);
      this.evaluateAlertsAfterSave({
        userId: data.userId,
        httpStatus: data.httpStatus,
        action: data.action,
      });
    } catch (err) {
      this.logger.error('AuditService.logSuccess failed', err);
    }
  }

  async logError(data: AuditLogErrorPayload): Promise<void> {
    try {
      const row = this.auditLogsRepository.create({
        userId: data.userId ?? null,
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId ?? null,
        clinicId: data.clinicId ?? null,
        status: AuditOutcome.ERROR,
        httpStatus: data.httpStatus,
        errorMessage: data.errorMessage,
        metadata: data.metadata ?? null,
      });
      await this.auditLogsRepository.save(row);
      this.evaluateAlertsAfterSave({
        userId: data.userId,
        httpStatus: data.httpStatus,
        action: data.action,
      });
    } catch (err) {
      this.logger.error('AuditService.logError failed', err);
    }
  }

  private pruneWindow(timestamps: number[]): number[] {
    const cutoff = Date.now() - SHORT_WINDOW_MS;
    return timestamps.filter((t) => t >= cutoff);
  }

  /**
   * Lightweight heuristics only (Logger.warn). Never blocks requests.
   */
  private evaluateAlertsAfterSave(ctx: {
    userId?: string | null;
    httpStatus: number;
    action: string;
  }): void {
    if (ctx.httpStatus === 403 && ctx.userId) {
      const list = this.user403Timestamps.get(ctx.userId) ?? [];
      list.push(Date.now());
      const pruned = this.pruneWindow(list);
      this.user403Timestamps.set(ctx.userId, pruned);
      if (pruned.length === ABUSE_WARN_AT) {
        this.logger.warn(`Potential abuse detected for user ${ctx.userId}`);
      }
    }

    if (ctx.action === 'CONSULTATION_STATUS_CHANGE') {
      this.statusChangeTimestamps.push(Date.now());
      const pruned = this.pruneWindow(this.statusChangeTimestamps);
      this.statusChangeTimestamps.length = 0;
      this.statusChangeTimestamps.push(...pruned);
      if (pruned.length === STATUS_CHANGE_WARN_AT) {
        this.logger.warn('Unusual status changes activity');
      }
    }
  }
}
