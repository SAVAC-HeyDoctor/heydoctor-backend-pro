import { IsUUID } from 'class-validator';

export class ConsultationSummaryQueryDto {
  @IsUUID('4')
  consultationId: string;
}
