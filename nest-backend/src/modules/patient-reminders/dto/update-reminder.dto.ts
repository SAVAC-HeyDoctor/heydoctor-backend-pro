import { IsOptional, IsString, IsDateString } from 'class-validator';

export class UpdatePatientReminderDto {
  @IsOptional()
  @IsString()
  reminderType?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
