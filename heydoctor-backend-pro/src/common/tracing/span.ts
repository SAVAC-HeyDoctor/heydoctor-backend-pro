import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import { getCurrentRequestId } from '../request-context.storage';

const log = new Logger('TraceSpan');

export type SpanEndMeta = {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  startTime: number;
  duration: number;
};

/**
 * Span ligero sobre AsyncLocalStorage (`requestId` = traceId).
 * Registra `trace_span` en logs para correlación con el cliente (`X-Request-Id`).
 */
export function createSpan(name: string): {
  end: (extra?: Record<string, unknown>) => SpanEndMeta;
} {
  const traceId = getCurrentRequestId() ?? 'no-trace';
  const spanId = randomUUID();
  const startTime = Date.now();
  const parentSpanId: string | null = null;

  return {
    end(extra?: Record<string, unknown>): SpanEndMeta {
      const duration = Date.now() - startTime;
      const meta: SpanEndMeta = {
        traceId,
        spanId,
        parentSpanId,
        name,
        startTime,
        duration,
      };
      log.log(
        JSON.stringify({
          event: 'trace_span',
          ...meta,
          ...extra,
        }),
      );
      return meta;
    },
  };
}
