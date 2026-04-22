import { ConsultationStatus } from '../consultation-status.enum';

/** Filtros internos del listado de consultas (no expuesto como query DTO separado). */
export interface ConsultationFiltersDto {
  patientId?: string;
  status?: ConsultationStatus;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}
