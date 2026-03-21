import {
  IsString,
  IsOptional,
  IsDateString,
  IsInt,
  IsBoolean,
  IsUUID,
  IsArray,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateConsultationDto {
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @IsOptional()
  @IsUUID()
  clinicId?: string;

  @IsOptional()
  @IsUUID()
  clinicalRecordId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  duration?: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  confirmed?: boolean;

  @IsOptional()
  @IsString()
  appointment_reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  files?: Record<string, unknown>[];

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  active?: boolean;
}
