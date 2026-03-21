import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MedicationItemDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  dosage?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsString()
  instructions?: string;
}

export class UpdatePrescriptionDto {
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
  consultationId?: string;

  @IsOptional()
  @IsUUID()
  diagnosisId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationItemDto)
  medications?: MedicationItemDto[];

  @IsOptional()
  @IsString()
  dosage?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
