import type { Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { ConsultationStatus } from './consultation-status.enum';

export type LogConsultationStatusChangeParams = {
  auditService: AuditService;
  /** Optional app logger (e.g. ConsultationsService logger). */
  logger?: Logger;
  authUser: AuthenticatedUser;
  previousStatus: ConsultationStatus;
  nextStatus: ConsultationStatus;
  consultationId: string;
  clinicId: string | null;
};

/**
 * Centralized consultation status transition logging (console + audit_logs).
 * Reuse from update(), future bulk updates, or automations.
 */
export function logConsultationStatusChange(
  params: LogConsultationStatusChangeParams,
): void {
  const {
    auditService,
    logger,
    authUser,
    previousStatus,
    nextStatus,
    consultationId,
    clinicId,
  } = params;

  logger?.log(
    `Consultation ${consultationId} status changed from ${previousStatus} to ${nextStatus} by user ${authUser.sub}`,
  );

  void auditService.logSuccess({
    userId: authUser.sub,
    action: 'CONSULTATION_STATUS_CHANGE',
    resource: 'consultation',
    resourceId: consultationId,
    clinicId,
    httpStatus: 200,
    metadata: {
      from: previousStatus,
      to: nextStatus,
      type: 'status_transition',
      doctorId: authUser.sub,
    },
  });
}
