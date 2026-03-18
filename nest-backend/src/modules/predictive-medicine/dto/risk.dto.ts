import { IsOptional, IsString, IsArray, IsObject } from 'class-validator';

export class PredictiveRiskDto {
  @IsOptional()
  @IsString()
  patientId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  conditions?: string[];

  @IsOptional()
  @IsObject()
  vitals?: Record<string, number>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  familyHistory?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  lifestyleFactors?: string[];
}
