import { Controller, Post, Body } from '@nestjs/common';
import { CdssService } from './cdss.service';
import { CdssEvaluateDto } from './dto/evaluate.dto';

@Controller('cdss')
export class CdssController {
  constructor(private readonly cdssService: CdssService) {}

  @Post('evaluate')
  async evaluate(@Body() dto: CdssEvaluateDto) {
    return this.cdssService.evaluate(dto);
  }
}
