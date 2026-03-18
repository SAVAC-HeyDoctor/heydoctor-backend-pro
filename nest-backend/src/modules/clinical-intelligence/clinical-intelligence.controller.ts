import { Controller, Get, Query } from '@nestjs/common';
import { ClinicalIntelligenceService } from './clinical-intelligence.service';

@Controller('clinical-intelligence')
export class ClinicalIntelligenceController {
  constructor(private readonly service: ClinicalIntelligenceService) {}

  @Get('suggest')
  async suggest(@Query('symptoms') symptoms: string) {
    return this.service.suggest(symptoms || '');
  }
}
