import { Controller, Get } from '@nestjs/common';
import { ClinicalAppsService } from './clinical-apps.service';

@Controller('clinical-apps')
export class ClinicalAppsController {
  constructor(private readonly service: ClinicalAppsService) {}

  @Get()
  async getApps() {
    return this.service.getApps();
  }
}
