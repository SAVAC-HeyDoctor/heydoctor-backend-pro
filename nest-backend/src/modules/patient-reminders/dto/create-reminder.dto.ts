import { IsOptional, IsString, IsDateString } from 'class-validator';

export class CreatePatientReminderDto {
  @IsString()
  patientId: string;

  @IsString()
  reminderType: string;

  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
