import {
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateConsultationDto {
  @IsUUID('4')
  patientId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(20000)
  reason: string;
}
