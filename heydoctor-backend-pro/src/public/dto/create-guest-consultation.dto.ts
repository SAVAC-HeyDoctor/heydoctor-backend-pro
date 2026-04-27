import { IsNotEmpty, IsString, Length } from 'class-validator';
import { Transform, type TransformFnParams } from 'class-transformer';

/**
 * Trimmer reutilizable para inputs de texto de DTOs. Mantiene el valor sin
 * tocar si no es string (ValidationPipe luego rechazará no-strings vía
 * `@IsString`).
 */
function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * DTO de entrada para `POST /api/public/consultations`. Es la única forma de
 * crear una consulta sin sesión autenticada y sin CSRF (el guard `CsrfGuard`
 * salta el prefijo `/api/public/`). Validamos longitud de campos para evitar
 * abuso/spam y truncamos espacios.
 */
export class CreateGuestConsultationDto {
  @IsString()
  @IsNotEmpty()
  @Length(1, 120)
  @Transform(trimString)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Length(1, 4000)
  @Transform(trimString)
  reason!: string;
}
