import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DoctorProfilesModule } from '../doctor-profiles/doctor-profiles.module';
import { Patient } from '../patients/patient.entity';
import { UsersModule } from '../users/users.module';
import { AuthorizationService } from './authorization.service';

@Module({
  imports: [
    UsersModule,
    DoctorProfilesModule,
    TypeOrmModule.forFeature([Patient]),
  ],
  providers: [AuthorizationService],
  exports: [AuthorizationService],
})
export class AuthorizationModule {}
