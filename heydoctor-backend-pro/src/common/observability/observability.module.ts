import { Global, Module } from '@nestjs/common';
import { RequestTraceIndexService } from './request-trace-index.service';

@Global()
@Module({
  providers: [RequestTraceIndexService],
  exports: [RequestTraceIndexService],
})
export class ObservabilityModule {}
