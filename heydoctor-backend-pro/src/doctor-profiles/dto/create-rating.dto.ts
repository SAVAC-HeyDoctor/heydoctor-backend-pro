import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateRatingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  patientName: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsUUID('4')
  consultationId: string;
}
