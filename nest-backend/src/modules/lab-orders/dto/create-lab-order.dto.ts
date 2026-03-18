import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateLabOrderDto {
  @IsUUID()
  patientId: string;

  @IsArray()
  @IsString({ each: true })
  tests: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}
