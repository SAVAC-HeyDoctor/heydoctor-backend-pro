import type { LoggerService } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AuditService } from '../audit/audit.service';
import { ConsultationStatus } from './consultation-status.enum';

export type LogConsultationStatusChangeParams = {
  auditService: AuditService;
  /** Optional app logger (e.g. ConsultationsService logger). */
  logger?: LoggerService;
  authUser: AuthenticatedUser;
  previousStatus: ConsultationStatus;
  nextStatus: ConsultationStatus;
  consultationId: string;
  clinicId: string | null;
  /** Assigned doctor (consultation.doctorId), for completion logs. */
  doctorId?: string | null;
  /** Patient FK on the consultation row (correlation only; never clinical text). */
  patientId?: string | null;
  /** HTTP correlation ID when invoked from a web request (see RequestIdMiddleware). */
  requestId?: string;
};

/**
 * Centralized consultation status transition logging (app logs + audit_logs).
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
    doctorId,
    patientId,
    requestId,
  } = params;

  const clinicKey = clinicId ?? undefined;
  const patientKey = patientId ?? undefined;

  logger?.log('Consultation status changed', {
    consultationId,
    patientId: patientKey,
    from: previousStatus,
    to: nextStatus,
    userId: authUser.sub,
    clinicId: clinicKey,
  });

  if (nextStatus === ConsultationStatus.COMPLETED && logger) {
    logger.log('Consultation completed', {
      consultationId,
      patientId: patientKey,
      doctorId: doctorId ?? authUser.sub,
      clinicId: clinicKey,
    });
  }

  const metadata: Record<string, unknown> = {
    from: previousStatus,
    to: nextStatus,
    type: 'status_transition',
    doctorId: authUser.sub,
  };
  if (requestId !== undefined && requestId !== '') {
    metadata.requestId = requestId;
  }

  void auditService.logSuccess({
    userId: authUser.sub,
    action: 'CONSULTATION_STATUS_CHANGE',
    resource: 'consultation',
    resourceId: consultationId,
    clinicId,
    httpStatus: 200,
    metadata,
  });
}
