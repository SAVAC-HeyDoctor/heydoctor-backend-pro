import { Global, Module } from '@nestjs/common';
import { OpsAsyncMetricsService } from './ops-async-metrics.service';

@Global()
@Module({
  providers: [OpsAsyncMetricsService],
  exports: [OpsAsyncMetricsService],
})
export class OpsMetricsSharedModule {}
