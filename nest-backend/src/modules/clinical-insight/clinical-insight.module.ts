import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Patient,
  ClinicalRecord,
  LabOrder,
  Prescription,
  Consultation,
} from '../../entities';
import { ClinicalInsightService } from './clinical-insight.service';
import { ClinicalInsightController } from './clinical-insight.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Patient,
      ClinicalRecord,
      LabOrder,
      Prescription,
      Consultation,
    ]),
  ],
  controllers: [ClinicalInsightController],
  providers: [ClinicalInsightService],
  exports: [ClinicalInsightService],
})
export class ClinicalInsightModule {}
