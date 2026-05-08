'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getApiBase } from '../../../lib/api-client';
import { apiFetchWithRefresh } from '../../../lib/session-fetch';

type OpsOverview = {
  uptime: number;
  requestsPerMinute: number;
  avgResponseTime: number;
  errorRate: number;
  activeUsers: number;
  paymentsToday: number;
  revenueToday: number;
  alertsLast24h: number;
  requestsPerMinuteSeries: { minute: string; count: number }[];
  errorsByEndpoint: {
    path: string;
    errorCount: number;
    requestCount: number;
    errorRate: number;
  }[];
  recentAlerts: {
    at: string;
    event: string;
    level: string;
    message?: string;
  }[];
};

async function fetchOpsOverview(): Promise<OpsOverview> {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}/api/admin/ops/overview`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as OpsOverview;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function AdminOpsPage() {
  const [data, setData] = useState<OpsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const o = await fetchOpsOverview();
      setData(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(id);
  }, [load]);

  const highError =
    data !== null && data.errorRate > 0.05;
  const zeroRevenue =
    data !== null && data.revenueToday === 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Operations
          </h1>
          <p className="text-sm text-slate-600">
            RPM/latencia/errores agregados en Redis cuando hay REDIS_URL; si no,
            vista por instancia (memoria). Auto cada 10s
          </p>
        </div>
        <nav className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/admin/growth"
            className="text-slate-600 underline hover:text-slate-900"
          >
            Growth
          </Link>
          <Link
            href="/admin/analytics"
            className="text-slate-600 underline hover:text-slate-900"
          >
            Analytics
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="text-slate-600 underline hover:text-slate-900"
          >
            Refrescar
          </button>
        </nav>
      </div>

      {highError && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950"
        >
          <strong>Tasa de error elevada:</strong> {(
            (data?.errorRate ?? 0) * 100
          ).toFixed(2)}
          % de peticiones 5xx en los últimos ~5 min (objetivo &lt; 5%).
        </div>
      )}

      {zeroRevenue && (
        <div
          role="status"
          className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          <strong>Revenue hoy (UTC):</strong> $0 CLP según eventos
          PAYMENT_SUCCEEDED. Comprueba webhooks Payku o si el día UTC recién
          comenzó.
        </div>
      )}

      {loading && (
        <p className="text-sm text-slate-600">Cargando panel…</p>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div
              className={`rounded-lg border bg-white p-4 shadow-sm ${
                highError ? 'border-red-400 ring-2 ring-red-100' : 'border-slate-200'
              }`}
            >
              <p className="text-xs font-medium uppercase text-slate-500">
                Error rate (~5 min)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {(data.errorRate * 100).toFixed(2)}%
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-slate-500">
                Requests / min
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {data.requestsPerMinute}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-slate-500">
                Latencia media (~1 min)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {data.avgResponseTime} ms
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-slate-500">
                Uptime proceso
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {formatUptime(data.uptime)}
              </p>
            </div>
          </section>

          <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div
              className={`rounded-lg border bg-white p-4 shadow-sm ${
                zeroRevenue ? 'border-amber-300' : 'border-slate-200'
              }`}
            >
              <p className="text-xs font-medium uppercase text-slate-500">
                Revenue hoy (UTC)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {data.revenueToday.toLocaleString('es-CL', {
                  style: 'currency',
                  currency: 'CLP',
                  maximumFractionDigits: 0,
                })}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-slate-500">
                Pagos hoy (eventos)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {data.paymentsToday}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-slate-500">
                Usuarios activos (~15 min)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {data.activeUsers}
              </p>
              <p className="mt-1 text-xs text-slate-500">product_events</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-slate-500">
                Alertas (24h, esta instancia)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {data.alertsLast24h}
              </p>
            </div>
          </section>

          <section className="mb-10 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">
              Requests por minuto (últimos 30 min, esta instancia)
            </h2>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.requestsPerMinuteSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="minute" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0ea5e9" name="Requests" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {data.errorsByEndpoint.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">
                Errores por endpoint (5xx, ~5 min)
              </h2>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Path</th>
                      <th className="px-3 py-2">5xx</th>
                      <th className="px-3 py-2">Total</th>
                      <th className="px-3 py-2">Err %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.errorsByEndpoint.map((row) => (
                      <tr
                        key={row.path}
                        className="border-t border-slate-100"
                      >
                        <td className="px-3 py-2 font-mono text-xs text-slate-800">
                          {row.path}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-red-700">
                          {row.errorCount}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.requestCount}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {(row.errorRate * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              Alertas recientes (memoria local)
            </h2>
            {data.recentAlerts.length === 0 ? (
              <p className="text-sm text-slate-600">Sin alertas en ventana.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.recentAlerts.map((a) => (
                  <li
                    key={`${a.at}-${a.event}`}
                    className="rounded border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <span className="font-medium text-slate-800">
                      {a.event}
                    </span>
                    <span className="ml-2 text-xs uppercase text-slate-500">
                      {a.level}
                    </span>
                    <span className="ml-2 text-xs text-slate-500">
                      {a.at}
                    </span>
                    {a.message && (
                      <p className="mt-1 text-slate-700">{a.message}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
