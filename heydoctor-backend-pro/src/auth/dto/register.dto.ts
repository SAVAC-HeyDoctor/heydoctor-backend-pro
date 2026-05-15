import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  IsEnum,
} from 'class-validator';

import { UserRole } from '../../users/user-role.enum';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsUUID()
  clinicId?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
