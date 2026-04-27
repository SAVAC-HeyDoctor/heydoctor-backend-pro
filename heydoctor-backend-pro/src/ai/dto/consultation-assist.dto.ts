import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ConsultationAssistDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  chiefComplaint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  symptoms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  notes?: string;
}
