'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  SubscriptionsMetricsResponse,
  SubscriptionsSummaryResponse,
} from '../../../components/subscriptions/types';
import { getApiBase } from '../../../lib/api-client';
import { apiFetchWithRefresh } from '../../../lib/session-fetch';

type MrrSeriesPoint = {
  monthStart: string;
  amount: number;
  paymentCount: number;
};

type MrrResponse = {
  monthsLookback: number;
  currentMonthAmount: number;
  series: MrrSeriesPoint[];
};

type ChurnPoint = {
  monthStart: string;
  subscriptionDeactivated: number;
  subscriptionExpired: number;
  churnEventsTotal: number;
};

type ChurnResponse = {
  monthsLookback: number;
  series: ChurnPoint[];
  lastClosedMonthStart: string;
  lastClosedMonthChurnRateVsProBase: number;
  totals?: { subscriptionDeactivated: number; subscriptionExpired: number };
};

type CohortHorizon = {
  offsetMonths: number;
  retainedUsers: number;
  retentionRate: number;
};

type CohortRow = {
  cohortMonth: string;
  signups: number;
  horizons: CohortHorizon[];
};

type CohortsResponse = {
  cohortMonthsLookback: number;
  horizonMonths: number;
  cohorts: CohortRow[];
};

async function fetchJson<T>(
  path: string,
): Promise<{ ok: boolean; body: T | null; status: number }> {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}${path}`, {
    method: 'GET',
  });
  if (!res.ok) {
    return { ok: false, body: null, status: res.status };
  }
  return { ok: true, body: (await res.json()) as T, status: res.status };
}

export default function AdminAnalyticsPage() {
  const [summary, setSummary] = useState<SubscriptionsSummaryResponse | null>(
    null,
  );
  const [metrics, setMetrics] =
    useState<SubscriptionsMetricsResponse | null>(null);
  const [mrr, setMrr] = useState<MrrResponse | null>(null);
  const [churn, setChurn] = useState<ChurnResponse | null>(null);
  const [cohorts, setCohorts] = useState<CohortsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    const [s, m, mr, ch, co] = await Promise.all([
      fetchJson<SubscriptionsSummaryResponse>('/api/admin/subscriptions/summary'),
      fetchJson<SubscriptionsMetricsResponse>('/api/admin/subscriptions/metrics'),
      fetchJson<MrrResponse>('/api/admin/subscriptions/mrr?months=12'),
      fetchJson<ChurnResponse>('/api/admin/subscriptions/churn?months=12'),
      fetchJson<CohortsResponse>(
        '/api/admin/subscriptions/cohorts?months=12&horizon=6',
      ),
    ]);
    const failed = [s, m, mr, ch, co].find((r) => !r.ok);
    if (failed) {
      setError(
        failed.status === 403
          ? 'Se requiere rol ADMIN para ver analytics.'
          : `Error cargando datos (HTTP ${failed.status}).`,
      );
      setSummary(null);
      setMetrics(null);
      setMrr(null);
      setChurn(null);
      setCohorts(null);
      setLoading(false);
      return;
    }
    setSummary(s.body);
    setMetrics(m.body);
    setMrr(mr.body);
    setChurn(ch.body);
    setCohorts(co.body);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mrrChartData = useMemo(
    () =>
      mrr?.series.map((p) => ({
        month: p.monthStart.slice(0, 7),
        amount: p.amount,
      })) ?? [],
    [mrr],
  );

  const churnChartData = useMemo(
    () =>
      churn?.series.map((p) => ({
        month: p.monthStart.slice(0, 7),
        churn: p.churnEventsTotal,
      })) ?? [],
    [churn],
  );

  const maxHorizon = cohorts?.horizonMonths ?? 0;

  const mrrGrowth = useMemo(() => {
    if (!mrr || mrr.series.length < 2) return null;
    const cur = mrr.series[mrr.series.length - 1]?.amount ?? 0;
    const prev = mrr.series[mrr.series.length - 2]?.amount ?? 0;
    if (!prev && !cur) return null;
    if (!prev) return { pct: null as number | null, delta: cur };
    const pct = ((cur - prev) / prev) * 100;
    return { pct, delta: cur - prev };
  }, [mrr]);

  const churnPctFmt = churn
    ? `${(churn.lastClosedMonthChurnRateVsProBase * 100).toFixed(2)}%`
    : '—';

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Analytics · Suscripciones
          </h1>
          <p className="text-sm text-slate-600">
            MRR desde pagos confirmados · cohortes · churn por eventos
          </p>
        </div>
        <nav className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/admin/subscriptions"
            className="text-slate-600 underline hover:text-slate-900"
          >
            Timeline / KPIs
          </Link>
          <Link
            href="/panel"
            className="text-slate-600 underline hover:text-slate-900"
          >
            Panel
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

      {loading && (
        <p className="text-sm text-slate-600">Cargando analytics…</p>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          {error}
        </div>
      )}

      {!loading && !error && summary && metrics && (
        <>
          <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                MRR mes UTC actual
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {mrr?.currentMonthAmount ?? metrics.monthlyRevenue}
              </p>
              {mrrGrowth?.pct != null && (
                <p className="mt-1 text-xs text-slate-600">
                  vs mes anterior · {mrrGrowth.pct >= 0 ? '+' : ''}
                  {mrrGrowth.pct.toFixed(1)}%
                </p>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Churn (event · mes cerrado)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {churnPctFmt}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {churn
                  ? `Base PRO snapshot · mes ${churn.lastClosedMonthStart}`
                  : null}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Altas (mes UTC)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {metrics.newSubscriptions}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Pagos confirmados · {metrics.paymentSuccessCount}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                PRO activo / total PRO
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {summary.activeSubscriptions} / {summary.proUsers}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Snapshot · autorización usa plan en DB activo (no estos eventos)
              </p>
            </div>
          </section>

          <section className="mb-10 grid gap-8 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-700">
                MRR mensual · pagos ({mrr?.monthsLookback ?? 12} meses)
              </h2>
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mrrChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="amount"
                      stroke="#2563eb"
                      name="amount"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-700">
                Eventos churn (deactivated + expired)
              </h2>
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={churnChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="churn"
                      stroke="#dc2626"
                      name="eventos"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {cohorts && cohorts.cohorts.length > 0 && (
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-700">
                Retención por cohorte (primer alta SUBSCRIPTION_CREATED; filas hasta
                mes +{maxHorizon ? maxHorizon - 1 : 0})
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-max border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left">
                      <th className="sticky left-0 z-10 bg-white px-2 py-2 font-medium">
                        Alta cohorte
                      </th>
                      <th className="px-2 py-2 font-medium">N</th>
                      {Array.from({ length: maxHorizon }, (_, i) => (
                        <th key={i} className="px-2 py-2 font-medium text-center">
                          +{i}m
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.cohorts.map((row) => (
                      <tr
                        key={row.cohortMonth}
                        className="border-b border-slate-100"
                      >
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-2 py-2 text-slate-800">
                          {row.cohortMonth}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-slate-700">
                          {row.signups}
                        </td>
                        {row.horizons.map((h) => {
                          const cell = `${(h.retentionRate * 100).toFixed(0)}%`;
                          const heat = Math.min(h.retentionRate * 220, 180);
                          const bg =
                            h.retentionRate > 0
                              ? `rgba(37,99,235,${0.12 + heat / 520})`
                              : undefined;
                          return (
                            <td
                              key={h.offsetMonths}
                              className="border-l border-slate-100 px-2 py-2 text-center tabular-nums text-slate-800"
                              style={{ backgroundColor: bg }}
                              title={`${h.retainedUsers} usuarios`}
                            >
                              {row.signups > 0 ? cell : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
