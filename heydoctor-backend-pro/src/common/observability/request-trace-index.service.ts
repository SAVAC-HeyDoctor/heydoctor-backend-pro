import { Injectable } from '@nestjs/common';

const MAX = 500;

export type RequestTraceEntry = {
  requestId: string;
  traceId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  at: string;
};

/**
 * Índice en memoria por instancia para buscar últimas peticiones por `requestId` / trace.
 */
@Injectable()
export class RequestTraceIndexService {
  private ring: RequestTraceEntry[] = [];

  record(entry: Omit<RequestTraceEntry, 'at'>): void {
    const row: RequestTraceEntry = {
      ...entry,
      at: new Date().toISOString(),
    };
    this.ring.unshift(row);
    if (this.ring.length > MAX) {
      this.ring.length = MAX;
    }
  }

  findByRequestId(requestId: string): RequestTraceEntry | undefined {
    return this.ring.find(
      (r) => r.requestId === requestId || r.traceId === requestId,
    );
  }

  /** Línea de tiempo reciente (orden desc). */
  timeline(limit = 40): RequestTraceEntry[] {
    return this.ring.slice(0, Math.min(limit, MAX));
  }
}
