/**
 * PHI (Protected Health Information) field registry.
 *
 * Maps entities to their PHI-classified fields per HIPAA §164.514.
 * Used by:
 * - GDPR anonymization pipeline (gdpr.service.ts)
 * - PHI access logging interceptor (when HIPAA_MODE=true)
 * - Data export endpoints
 * - Compliance audits
 *
 * Classification levels:
 * - DIRECT_IDENTIFIER: Directly identifies an individual (name, email, etc.)
 * - CLINICAL: Health information (diagnosis, treatment, notes)
 * - QUASI_IDENTIFIER: Can identify when combined (IP, user-agent, timestamps)
 * - SIGNATURE: Legal proof (digital signatures)
 */

export enum PhiClassification {
  DIRECT_IDENTIFIER = 'DIRECT_IDENTIFIER',
  CLINICAL = 'CLINICAL',
  QUASI_IDENTIFIER = 'QUASI_IDENTIFIER',
  SIGNATURE = 'SIGNATURE',
}

export type PhiFieldDescriptor = {
  entity: string;
  table: string;
  column: string;
  classification: PhiClassification;
  anonymizationStrategy: 'replace' | 'nullify' | 'hash' | 'retain';
  retentionReason?: string;
};

export const PHI_FIELDS_REGISTRY: PhiFieldDescriptor[] = [
  // --- users ---
  {
    entity: 'User',
    table: 'users',
    column: 'email',
    classification: PhiClassification.DIRECT_IDENTIFIER,
    anonymizationStrategy: 'replace',
  },
  {
    entity: 'User',
    table: 'users',
    column: 'password_hash',
    classification: PhiClassification.DIRECT_IDENTIFIER,
    anonymizationStrategy: 'replace',
  },

  // --- patients ---
  {
    entity: 'Patient',
    table: 'patients',
    column: 'name',
    classification: PhiClassification.DIRECT_IDENTIFIER,
    anonymizationStrategy: 'replace',
  },
  {
    entity: 'Patient',
    table: 'patients',
    column: 'email',
    classification: PhiClassification.DIRECT_IDENTIFIER,
    anonymizationStrategy: 'replace',
  },

  // --- consultations ---
  {
    entity: 'Consultation',
    table: 'consultations',
    column: 'reason',
    classification: PhiClassification.CLINICAL,
    anonymizationStrategy: 'replace',
  },
  {
    entity: 'Consultation',
    table: 'consultations',
    column: 'diagnosis',
    classification: PhiClassification.CLINICAL,
    anonymizationStrategy: 'replace',
  },
  {
    entity: 'Consultation',
    table: 'consultations',
    column: 'treatment',
    classification: PhiClassification.CLINICAL,
    anonymizationStrategy: 'replace',
  },
  {
    entity: 'Consultation',
    table: 'consultations',
    column: 'notes',
    classification: PhiClassification.CLINICAL,
    anonymizationStrategy: 'replace',
  },
  {
    entity: 'Consultation',
    table: 'consultations',
    column: 'ai_summary',
    classification: PhiClassification.CLINICAL,
    anonymizationStrategy: 'replace',
  },
  {
    entity: 'Consultation',
    table: 'consultations',
    column: 'ai_improved_notes',
    classification: PhiClassification.CLINICAL,
    anonymizationStrategy: 'replace',
  },
  {
    entity: 'Consultation',
    table: 'consultations',
    column: 'ai_suggested_diagnosis',
    classification: PhiClassification.CLINICAL,
    anonymizationStrategy: 'nullify',
  },
  {
    entity: 'Consultation',
    table: 'consultations',
    column: 'doctor_signature',
    classification: PhiClassification.SIGNATURE,
    anonymizationStrategy: 'nullify',
  },
  {
    entity: 'Consultation',
    table: 'consultations',
    column: 'patient_signature',
    classification: PhiClassification.SIGNATURE,
    anonymizationStrategy: 'nullify',
  },

  // --- telemedicine_consents ---
  {
    entity: 'TelemedicineConsent',
    table: 'telemedicine_consents',
    column: 'ip',
    classification: PhiClassification.QUASI_IDENTIFIER,
    anonymizationStrategy: 'nullify',
  },
  {
    entity: 'TelemedicineConsent',
    table: 'telemedicine_consents',
    column: 'user_agent',
    classification: PhiClassification.QUASI_IDENTIFIER,
    anonymizationStrategy: 'nullify',
  },

  // --- refresh_tokens ---
  {
    entity: 'RefreshToken',
    table: 'refresh_tokens',
    column: 'ip_address',
    classification: PhiClassification.QUASI_IDENTIFIER,
    anonymizationStrategy: 'nullify',
  },
  {
    entity: 'RefreshToken',
    table: 'refresh_tokens',
    column: 'user_agent',
    classification: PhiClassification.QUASI_IDENTIFIER,
    anonymizationStrategy: 'nullify',
  },

  // --- audit_logs (NEVER anonymized — legal retention) ---
  {
    entity: 'AuditLog',
    table: 'audit_logs',
    column: 'user_id',
    classification: PhiClassification.QUASI_IDENTIFIER,
    anonymizationStrategy: 'retain',
    retentionReason: 'Legal audit trail — indefinite retention required',
  },
  {
    entity: 'AuditLog',
    table: 'audit_logs',
    column: 'metadata',
    classification: PhiClassification.QUASI_IDENTIFIER,
    anonymizationStrategy: 'retain',
    retentionReason: 'Legal audit trail — indefinite retention required',
  },
];

/** Group PHI fields by entity for quick lookup. */
export function getPhiFieldsByEntity(entityName: string): PhiFieldDescriptor[] {
  return PHI_FIELDS_REGISTRY.filter((f) => f.entity === entityName);
}

/** Get all entities that contain PHI. */
export function getPhiEntities(): string[] {
  return [...new Set(PHI_FIELDS_REGISTRY.map((f) => f.entity))];
}
