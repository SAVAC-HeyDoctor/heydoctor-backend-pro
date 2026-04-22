import { BadRequestException } from '@nestjs/common';

export function requireClinicId(clinicId: string | null | undefined): string {
  if (clinicId == null || String(clinicId).trim() === '') {
    throw new BadRequestException('Clinic id is required');
  }
  return String(clinicId).trim();
}

export function clampListPagination(
  limit?: number,
  offset?: number,
): { limit: number; offset: number } {
  const l = Math.min(Math.max(limit ?? 20, 1), 100);
  const o = Math.max(offset ?? 0, 0);
  return { limit: l, offset: o };
}

/** Fecha calendario `YYYY-MM-DD` → día UTC completo; ISO con hora → tal cual. */
export function parseConsultationListDate(
  iso: string,
  bound: 'start' | 'end',
): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return new Date(
      bound === 'start' ? `${iso}T00:00:00.000Z` : `${iso}T23:59:59.999Z`,
    );
  }
  return new Date(iso);
}
