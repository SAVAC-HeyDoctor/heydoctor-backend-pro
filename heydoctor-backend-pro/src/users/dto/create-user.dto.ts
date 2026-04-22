import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '../user-role.enum';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6, { message: 'password must be at least 6 characters' })
  password: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
