import { Controller, Get, Param } from '@nestjs/common';
import { ClinicalInsightService } from './clinical-insight.service';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';

@Controller('clinical-insight')
export class ClinicalInsightController {
  constructor(private readonly service: ClinicalInsightService) {}

  @Get('patient/:id')
  async getPatientInsight(
    @Param('id') patientId: string,
    @ClinicId() clinicId: string,
  ) {
    if (!clinicId) {
      return { data: null };
    }
    return this.service.getPatientInsight(patientId, clinicId);
  }
}
