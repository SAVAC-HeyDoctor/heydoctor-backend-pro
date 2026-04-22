import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateDoctorApplicationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  specialty: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  country: string;

  @IsOptional()
  @IsString()
  licenseUrl?: string;
}
