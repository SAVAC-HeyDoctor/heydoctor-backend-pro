/** Valores estables para consultas y reporting */
export const AuditActions = {
  PATIENT_READ: 'patient.read',
  DIAGNOSIS_CREATE: 'diagnosis.create',
  DIAGNOSIS_UPDATE: 'diagnosis.update',
  PRESCRIPTION_CREATE: 'prescription.create',
  LAB_ORDER_CREATE: 'lab_order.create',
  LAB_ORDER_UPDATE: 'lab_order.update',
  LAB_ORDER_DELETE: 'lab_order.delete',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];
