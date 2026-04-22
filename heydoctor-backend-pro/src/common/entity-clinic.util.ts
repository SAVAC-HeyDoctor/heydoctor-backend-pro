import { BadRequestException } from '@nestjs/common';

/**
 * Valida que exista clínica desde contexto de autorización antes de persistir.
 */
export function assertClinicIdForSave(
  clinicId: string | null | undefined,
): string {
  if (clinicId == null || String(clinicId).trim() === '') {
    throw new BadRequestException(
      'clinicId is required from authorization context before save',
    );
  }
  return String(clinicId).trim();
}

/**
 * Asigna `clinicId` y referencia mínima a `clinic` para entidades multi-tenant.
 * No usar valores enviados por el cliente; pasar siempre el resultado de
 * {@link AuthorizationService.getUserWithClinic} (u origen equivalente en servidor).
 */
export function assignClinic<
  T extends { clinicId?: string; clinic?: { id: string } },
>(entity: T, clinicId: string | null | undefined): T {
  const cid = assertClinicIdForSave(clinicId);
  entity.clinicId = cid;
  entity.clinic = { id: cid };
  return entity;
}
