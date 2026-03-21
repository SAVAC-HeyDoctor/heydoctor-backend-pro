export type AuditResourceType =
  | 'patient'
  | 'diagnosis'
  | 'prescription'
  | 'lab_order';

/**
 * Metadatos para el interceptor: de dónde sacar IDs (params, body o respuesta).
 */
export interface AuditLogOptions {
  action: string;
  resourceType: AuditResourceType;
  /** Nombre del parámetro de ruta con el patientId (p. ej. `id` en GET /patients/:id) */
  patientIdParam?: string;
  /** Clave en body JSON */
  patientIdBodyKey?: string;
  /** Tras éxito, usar `response.data.patientId` si existe */
  patientIdFromResponse?: boolean;
  /** Parámetro de ruta del recurso (por defecto muchos usan `id`) */
  resourceIdParam?: string;
  /** Tras éxito, usar `response.data.id` (entidad creada/actualizada) */
  resourceIdFromResponse?: boolean;
}
