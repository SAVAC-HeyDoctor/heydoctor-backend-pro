import { Module } from '@nestjs/common';
import { PredictiveMedicineService } from './predictive-medicine.service';
import { PredictiveMedicineController } from './predictive-medicine.controller';

@Module({
  controllers: [PredictiveMedicineController],
  providers: [PredictiveMedicineService],
  exports: [PredictiveMedicineService],
})
export class PredictiveMedicineModule {}
