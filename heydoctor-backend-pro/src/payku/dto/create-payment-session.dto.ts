import { IsUUID } from 'class-validator';

export class CreatePaymentSessionDto {
  @IsUUID('4')
  consultationId: string;
}
