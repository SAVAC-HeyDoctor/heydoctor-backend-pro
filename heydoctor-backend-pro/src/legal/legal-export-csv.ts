export type LegalConsultationExportRow = {
  consultationId: string;
  createdAt: Date | string;
  doctorId: string;
  patientId: string;
  consentId: string | null;
  consentVersion: string | null;
  consentGivenAt: Date | string | null;
  consentIp: string | null;
  consentUserAgent: string | null;
};

const HEADER =
  'consultationId,createdAt,doctorId,patientId,consentId,consentVersion,consentGivenAt,consentIp,consentUserAgent';

function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toIso(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

/** CSV UTF-8 para export legal (solo campos acordados; sin PII de paciente/médico). */
export function formatLegalConsultationsCsv(
  rows: LegalConsultationExportRow[],
): string {
  const lines = [HEADER];
  for (const row of rows) {
    lines.push(
      [
        escapeCsvCell(row.consultationId),
        escapeCsvCell(toIso(row.createdAt)),
        escapeCsvCell(row.doctorId),
        escapeCsvCell(row.patientId),
        escapeCsvCell(row.consentId),
        escapeCsvCell(row.consentVersion),
        escapeCsvCell(toIso(row.consentGivenAt)),
        escapeCsvCell(row.consentIp),
        escapeCsvCell(row.consentUserAgent),
      ].join(','),
    );
  }
  return lines.join('\r\n');
}
