import { Controller, Post, Body } from '@nestjs/common';
import { PredictiveMedicineService } from './predictive-medicine.service';
import { PredictiveRiskDto } from './dto/risk.dto';

@Controller('predictive-medicine')
export class PredictiveMedicineController {
  constructor(private readonly service: PredictiveMedicineService) {}

  @Post('risk')
  async assessRisk(@Body() dto: PredictiveRiskDto) {
    return this.service.assessRisk(dto);
  }
}
