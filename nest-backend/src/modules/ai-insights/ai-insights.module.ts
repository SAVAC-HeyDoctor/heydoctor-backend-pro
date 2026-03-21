import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AiInsight,
  Patient,
  Consultation,
  ClinicalRecord,
  LabOrder,
  Prescription,
} from '../../entities';
import { CommonModule } from '../../common/common.module';
import { AiInsightsController } from './ai-insights.controller';
import { AiInsightsService } from './ai-insights.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AiInsight,
      Patient,
      Consultation,
      ClinicalRecord,
      LabOrder,
      Prescription,
    ]),
    CommonModule,
  ],
  controllers: [AiInsightsController],
  providers: [AiInsightsService],
  exports: [AiInsightsService],
})
export class AiInsightsModule {}
