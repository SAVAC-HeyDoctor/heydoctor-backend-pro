import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { AiInsightsService } from './ai-insights.service';
import { GenerateInsightsDto } from './dto/generate-insights.dto';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';

@Controller('ai-insights')
export class AiInsightsController {
  constructor(private readonly aiInsightsService: AiInsightsService) {}

  @Get('patient/:patientId')
  async getByPatient(
    @Param('patientId') patientId: string,
    @ClinicId() clinicId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.aiInsightsService.getByPatient(
      patientId,
      clinicId || undefined,
      isNaN(limitNum) ? 10 : Math.min(limitNum, 50),
    );
  }

  @Post('generate')
  async generate(
    @ClinicId() clinicId: string,
    @Body() dto: GenerateInsightsDto,
  ) {
    return this.aiInsightsService.generate(dto, clinicId || undefined);
  }
}
