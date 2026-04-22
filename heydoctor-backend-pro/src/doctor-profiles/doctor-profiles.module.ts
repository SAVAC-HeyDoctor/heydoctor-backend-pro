import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthorizationModule } from '../authorization/authorization.module';
import { DoctorProfile } from './doctor-profile.entity';
import { DoctorRating } from './doctor-rating.entity';
import { DoctorProfilesController } from './doctor-profiles.controller';
import { DoctorProfilesService } from './doctor-profiles.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DoctorProfile, DoctorRating]),
    forwardRef(() => AuthorizationModule),
  ],
  controllers: [DoctorProfilesController],
  providers: [DoctorProfilesService],
  exports: [DoctorProfilesService],
})
export class DoctorProfilesModule {}
