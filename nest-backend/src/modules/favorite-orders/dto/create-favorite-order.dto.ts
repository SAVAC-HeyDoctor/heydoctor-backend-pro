import { IsOptional, IsString } from 'class-validator';

export class CreateFavoriteOrderDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  items?: Record<string, unknown>;
}
