import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../users/user-role.enum';
import { ConsultationStatus } from './consultation-status.enum';

/** Canonical order for forward-only (skipping allowed for admin). */
const PIPELINE_ORDER: ConsultationStatus[] = [
  ConsultationStatus.DRAFT,
  ConsultationStatus.IN_PROGRESS,
  ConsultationStatus.COMPLETED,
  ConsultationStatus.SIGNED,
  ConsultationStatus.LOCKED,
];

function pipelineIndex(status: ConsultationStatus): number {
  return PIPELINE_ORDER.indexOf(status);
}

/** Single forward step allowed from each non-terminal status (doctor workflow). */
const NEXT_STATUS: Partial<Record<ConsultationStatus, ConsultationStatus>> = {
  [ConsultationStatus.DRAFT]: ConsultationStatus.IN_PROGRESS,
  [ConsultationStatus.IN_PROGRESS]: ConsultationStatus.COMPLETED,
  [ConsultationStatus.COMPLETED]: ConsultationStatus.SIGNED,
  [ConsultationStatus.SIGNED]: ConsultationStatus.LOCKED,
};

/**
 * Returns true if `next` is a valid status change from `current`:
 * - same status (no-op), or
 * - exactly one allowed forward step in the clinical workflow.
 */
export function isValidTransition(
  current: ConsultationStatus,
  next: ConsultationStatus,
): boolean {
  if (current === next) {
    return true;
  }
  if (current === ConsultationStatus.LOCKED) {
    return false;
  }
  return NEXT_STATUS[current] === next;
}

/**
 * Clinical rules for any role: strict forward in the pipeline; lock only from signed.
 * Allows skipping intermediate states (used together with {@link assertRoleForTransition}).
 */
export function assertClinicalStatusTransition(
  current: ConsultationStatus,
  next: ConsultationStatus,
): void {
  if (current === next) {
    return;
  }
  if (current === ConsultationStatus.LOCKED) {
    throw new BadRequestException(
      'Invalid status transition: consultation is locked',
    );
  }
  if (next === ConsultationStatus.LOCKED) {
    if (current !== ConsultationStatus.SIGNED) {
      throw new BadRequestException(
        'Invalid status transition: can only lock from signed status',
      );
    }
    return;
  }
  const i = pipelineIndex(current);
  const j = pipelineIndex(next);
  if (j <= i) {
    throw new BadRequestException(
      `Invalid status transition: cannot change from "${current}" to "${next}"`,
    );
  }
}

/**
 * Role-specific rules on top of {@link assertClinicalStatusTransition}.
 * - Doctor: one step only ({@link isValidTransition}); lock only signed → locked (already enforced).
 * - Admin: any forward jump allowed by clinical assert (including skips); lock only from signed.
 */
export function assertRoleForTransition(
  role: UserRole,
  current: ConsultationStatus,
  next: ConsultationStatus,
): void {
  if (current === next) {
    return;
  }

  if (role === UserRole.DOCTOR) {
    if (!isValidTransition(current, next)) {
      throw new ForbiddenException(
        'Doctors may only advance consultation status one step at a time in the clinical workflow',
      );
    }
    return;
  }

  if (role === UserRole.ADMIN) {
    return;
  }

  throw new ForbiddenException('Your role cannot change consultation status');
}
