import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ConsultationStatus } from '../../consultations/consultation-status.enum';

/** Query params for list endpoints (paginación + filtros opcionales de consultas). */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Filtro de listado de consultas (acepta `IN_PROGRESS` o `in_progress`). */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return String(value).trim().toLowerCase().replace(/-/g, '_');
  })
  @IsEnum(ConsultationStatus)
  status?: ConsultationStatus;

  /** Inicio del rango por `createdAt` (ISO 8601, p. ej. `2026-04-20`). */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Fin del rango por `createdAt` (inclusive si es solo fecha `YYYY-MM-DD`). */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** Filtro por paciente en listados de consultas. */
  @IsOptional()
  @IsUUID()
  patientId?: string;
}
