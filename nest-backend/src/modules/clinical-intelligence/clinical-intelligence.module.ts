import { Module } from '@nestjs/common';
import { ClinicalIntelligenceService } from './clinical-intelligence.service';
import { ClinicalIntelligenceController } from './clinical-intelligence.controller';

@Module({
  controllers: [ClinicalIntelligenceController],
  providers: [ClinicalIntelligenceService],
  exports: [ClinicalIntelligenceService],
})
export class ClinicalIntelligenceModule {}
