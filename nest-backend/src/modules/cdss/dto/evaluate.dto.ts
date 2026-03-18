import { IsOptional, IsString, IsArray, IsObject } from 'class-validator';

export class CdssEvaluateDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsArray()
  symptoms?: string[];

  @IsOptional()
  @IsObject()
  vitals?: Record<string, number>;

  @IsOptional()
  @IsArray()
  currentMedications?: string[];

  @IsOptional()
  @IsArray()
  allergies?: string[];
}
