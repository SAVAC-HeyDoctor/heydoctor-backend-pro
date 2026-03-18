import { IsOptional, IsString, IsArray } from 'class-validator';

export class GenerateClinicalNoteDto {
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptoms?: string[];

  @IsOptional()
  @IsString()
  findings?: string;
}
