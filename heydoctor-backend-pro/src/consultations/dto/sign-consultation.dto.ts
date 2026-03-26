import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Firma base64 (acepta payload puro o data URL).
 */
export class SignConsultationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500_000)
  @Matches(
    /^(?:data:[\w/+.-]+;base64,)?[A-Za-z0-9+/=\r\n]+$/,
    { message: 'signature must be valid base64 content' },
  )
  signature: string;
}
