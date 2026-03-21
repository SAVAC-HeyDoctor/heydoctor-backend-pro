import { IsOptional, IsString, IsUUID, IsArray } from 'class-validator';

export class GenerateInsightsDto {
  @IsUUID()
  patientId: string;

  @IsOptional()
  @IsUUID()
  consultationId?: string;

  @IsOptional()
  @IsUUID()
  clinicId?: string;

  /** Symptoms or clinical context for AI analysis. */
  @IsOptional()
  @IsString()
  symptoms?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptomsList?: string[];

  /** Additional context (e.g. recent diagnoses, lab results summary). */
  @IsOptional()
  @IsString()
  context?: string;
}
