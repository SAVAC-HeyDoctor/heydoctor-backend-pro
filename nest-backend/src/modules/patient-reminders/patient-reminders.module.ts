import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientReminder, Patient } from '../../entities';
import { PatientRemindersService } from './patient-reminders.service';
import { PatientRemindersController } from './patient-reminders.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PatientReminder, Patient]),
  ],
  controllers: [PatientRemindersController],
  providers: [PatientRemindersService],
  exports: [PatientRemindersService],
})
export class PatientRemindersModule {}
