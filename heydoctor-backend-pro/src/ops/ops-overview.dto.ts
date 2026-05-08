/** GET /api/admin/ops/overview */
export type OpsOverviewDto = {
  uptime: number;
  requestsPerMinute: number;
  avgResponseTime: number;
  errorRate: number;
  activeUsers: number;
  paymentsToday: number;
  revenueToday: number;
  alertsLast24h: number;
  /** Últimos 30 minutos, bucket por minuto (UTC), para gráficos. */
  requestsPerMinuteSeries: { minute: string; count: number }[];
  /** Top endpoints con 5xx en la ventana de métricas HTTP (~5 min). */
  errorsByEndpoint: {
    path: string;
    errorCount: number;
    requestCount: number;
    errorRate: number;
  }[];
  /** Últimas alertas vía sink (memoria por instancia). */
  recentAlerts: {
    at: string;
    event: string;
    level: string;
    message?: string;
  }[];
};
