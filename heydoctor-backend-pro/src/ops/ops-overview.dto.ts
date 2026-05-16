/** GET /api/admin/ops/overview */
export type OpsOverviewDto = {
  uptime: number;
  requestsPerMinute: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  activeUsers: number;
  paymentsToday: number;
  revenueToday: number;
  alertsLast24h: number;
  socketIoRedis: {
    adapter: 'redis' | 'local';
    status: string;
    redisConfigured: boolean;
    pubStatus: string | null;
    subStatus: string | null;
    lastEventAt: string;
    lastError: string | null;
  };
  /** Últimos 30 minutos, bucket por minuto (UTC), para gráficos. */
  requestsPerMinuteSeries: { minute: string; count: number }[];
  /** Top endpoints con 5xx en la ventana de métricas HTTP (~5 min). */
  errorsByEndpoint: {
    path: string;
    errorCount: number;
    requestCount: number;
    errorRate: number;
  }[];
  /** Top paths por latencia media (muestras en esta réplica, ~5 min). */
  topEndpointsByLatency: {
    path: string;
    avgMs: number;
    count: number;
  }[];
  /** Línea de tiempo: últimas peticiones indexadas en esta instancia. */
  requestTraceTimeline: {
    requestId: string;
    traceId: string;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    at: string;
  }[];
  /** Últimas alertas vía sink (memoria por instancia). */
  recentAlerts: {
    at: string;
    event: string;
    level: string;
    message?: string;
    analysis?: string;
  }[];
};
