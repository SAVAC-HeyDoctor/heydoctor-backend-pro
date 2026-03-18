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

export class CreatePrescriptionDto {
  @IsUUID()
  patientId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MedicationItemDto)
  medications: MedicationItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
