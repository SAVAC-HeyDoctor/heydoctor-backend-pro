import { IsOptional, IsString } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  type?: string;
}
