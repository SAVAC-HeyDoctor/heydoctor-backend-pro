export type DeadLetterItemDto = {
  id: string;
  eventType: string;
  status: 'failed' | 'stuck_retry' | 'pending';
  failureReason: string | null;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  requestId: string | null;
  traceSource: string | null;
  createdAt: string;
  updatedAt: string;
  deadLetteredAt: string | null;
  payload: Record<string, unknown>;
};

export type DeadLettersDto = {
  summary: {
    failedOutboxEvents: number;
    retryExhausted: number;
    poisonEvents: number;
    stuckRetries: number;
    pendingPayments: number;
  };
  metrics: {
    retryRate: number;
    deadLetterRate: number;
    webhookFailureRate: number;
    queueLagMs: number;
    eventProcessingLatencyMs: number;
  };
  items: DeadLetterItemDto[];
};
