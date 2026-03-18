import { Module } from '@nestjs/common';
import { ClinicalAppsService } from './clinical-apps.service';
import { ClinicalAppsController } from './clinical-apps.controller';

@Module({
  controllers: [ClinicalAppsController],
  providers: [ClinicalAppsService],
  exports: [ClinicalAppsService],
})
export class ClinicalAppsModule {}
