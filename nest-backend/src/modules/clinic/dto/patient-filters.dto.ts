import { IsOptional, IsString, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PatientFiltersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;
}
