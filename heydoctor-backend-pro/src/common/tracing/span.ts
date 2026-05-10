import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import { Logger } from '@nestjs/common';
import { getCurrentRequestId } from '../request-context.storage';

const log = new Logger('TraceSpan');

export type TraceContext = {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
};

export type SpanEndMeta = {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  startTime: number;
  duration: number;
};

export type TraceSpan = {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  end: (extra?: Record<string, unknown>) => SpanEndMeta;
};

const traceContext = new AsyncLocalStorage<TraceContext>();

export function getCurrentTraceId(): string | null {
  return traceContext.getStore()?.traceId ?? getCurrentRequestId() ?? null;
}

export function getCurrentTraceContext(): TraceContext | null {
  return traceContext.getStore() ?? null;
}

/**
 * Span ligero sobre AsyncLocalStorage (`requestId` = traceId).
 * Registra `trace_span` en logs para correlación con el cliente (`X-Request-Id`).
 */
export function createSpan(name: string): TraceSpan {
  const parent = traceContext.getStore();
  const traceId = parent?.traceId ?? getCurrentRequestId() ?? randomUUID();
  const spanId = randomUUID();
  const startTime = Date.now();
  const parentSpanId = parent?.spanId ?? null;
  const context: TraceContext = {
    traceId,
    spanId,
    parentSpanId,
  };

  traceContext.enterWith(context);

  log.log(
    JSON.stringify({
      event: 'trace_span_start',
      traceId,
      spanId,
      parentSpanId,
      name,
      startTime,
    }),
  );

  return {
    traceId,
    spanId,
    parentSpanId,
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
          event: 'trace_span_end',
          ...meta,
          ...extra,
        }),
      );

      if (parent) {
        traceContext.enterWith(parent);
      }

      return meta;
    },
  };
}
