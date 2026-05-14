import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '../user-role.enum';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @IsEmail()
@ApiProperty()
  email: string;

  @IsString()
  @MinLength(6, { message: 'password must be at least 6 characters' })
@ApiProperty() 
 password: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
