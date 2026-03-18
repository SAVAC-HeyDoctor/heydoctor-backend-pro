import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Get('doctor-adoption')
  async getDoctorAdoption(
    @ClinicId() clinicId: string,
    @Query('days') days: string,
  ) {
    if (!clinicId) {
      return {
        data: {
          period: { days: 30, from: new Date().toISOString() },
          adoption: [],
        },
      };
    }
    const daysNum = days ? parseInt(days, 10) : 30;
    return this.service.getDoctorAdoption(clinicId, isNaN(daysNum) ? 30 : daysNum);
  }
}
