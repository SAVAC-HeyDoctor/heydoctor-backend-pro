import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../users/user-role.enum';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6, { message: 'password must be at least 6 characters' })
  password: string;

  /** Clínica existente (crear fila en `clinics` antes del primer admin). */
  @IsUUID()
  clinicId: string;

  /** Por defecto `admin` para bootstrap del tenant. */
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
