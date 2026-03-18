import { Module } from '@nestjs/common';
import { CdssService } from './cdss.service';
import { CdssController } from './cdss.controller';

@Module({
  controllers: [CdssController],
  providers: [CdssService],
  exports: [CdssService],
})
export class CdssModule {}
