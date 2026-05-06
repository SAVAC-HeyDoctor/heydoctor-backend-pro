'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { SubscriptionTimeline } from '../../../components/subscriptions/SubscriptionTimeline';
import type {
  SubscriptionEventRow,
  SubscriptionsMetricsResponse,
  SubscriptionsSummaryResponse,
} from '../../../components/subscriptions/types';
import { getApiBase } from '../../../lib/api-client';
import { apiFetchWithRefresh } from '../../../lib/session-fetch';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function fetchJson<T>(path: string): Promise<{ ok: boolean; status: number; body: T | null }> {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}${path}`, { method: 'GET' });
  if (!res.ok) {
    return { ok: false, status: res.status, body: null };
  }
  return { ok: true, status: res.status, body: (await res.json()) as T };
}

export default function AdminSubscriptionsPage() {
  const [summary, setSummary] = useState<SubscriptionsSummaryResponse | null>(null);
  const [metrics, setMetrics] = useState<SubscriptionsMetricsResponse | null>(null);
  const [dashError, setDashError] = useState<string | null>(null);
  const [dashLoading, setDashLoading] = useState(true);

  const [userId, setUserId] = useState('');
  const [events, setEvents] = useState<SubscriptionEventRow[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setDashLoading(true);
    setDashError(null);
    try {
      const [sRes, mRes] = await Promise.all([
        fetchJson<SubscriptionsSummaryResponse>('/api/admin/subscriptions/summary'),
        fetchJson<SubscriptionsMetricsResponse>('/api/admin/subscriptions/metrics'),
      ]);
      if (!sRes.ok || !mRes.ok) {
        if (sRes.status === 403 || mRes.status === 403) {
          setDashError('No tienes permisos de administrador para ver este dashboard.');
        } else {
          setDashError(`Error cargando datos (${sRes.status} / ${mRes.status}).`);
        }
        setSummary(null);
        setMetrics(null);
        return;
      }
      setSummary(sRes.body);
      setMetrics(mRes.body);
    } catch {
      setDashError('Error de red al cargar el dashboard.');
    } finally {
      setDashLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const loadTimeline = async () => {
    const trimmed = userId.trim();
    if (!UUID_RE.test(trimmed)) {
      setTimelineError('Introduce un UUID v4 válido de usuario.');
      setEvents([]);
      return;
    }
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const r = await fetchJson<SubscriptionEventRow[]>(
        `/api/admin/subscriptions/${trimmed}/events`,
      );
      if (!r.ok) {
        if (r.status === 403) {
          setTimelineError('Sin permisos para consultar timeline.');
        } else {
          setTimelineError(`Error ${r.status} al cargar eventos.`);
        }
        setEvents([]);
        return;
      }
      setEvents(Array.isArray(r.body) ? r.body : []);
    } catch {
      setTimelineError('Error de red al cargar timeline.');
      setEvents([]);
    } finally {
      setTimelineLoading(false);
    }
  };

  const churnPct =
    metrics == null ? '—' : `${(metrics.churnRate * 100).toFixed(1)}%`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">
          Suscripciones (admin)
        </h1>
        <nav className="flex gap-3 text-sm">
          <Link href="/panel" className="text-slate-600 underline hover:text-slate-900">
            Panel
          </Link>
          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="text-slate-600 underline hover:text-slate-900"
          >
            Recargar métricas
          </button>
        </nav>
      </div>

      {dashLoading && (
        <p className="text-sm text-slate-600">Cargando resumen…</p>
      )}

      {!dashLoading && dashError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          {dashError}
        </div>
      )}

      {!dashLoading && !dashError && summary && metrics && (
        <section className="mb-10 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Resumen actual
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600">Total usuarios</dt>
                <dd className="font-medium">{summary.totalUsers}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600">Usuarios PRO (fila BD)</dt>
                <dd className="font-medium">{summary.proUsers}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600">PRO inactivos</dt>
                <dd className="font-medium">{summary.inactivePro}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600">PRO activos</dt>
                <dd className="font-medium">{summary.activeSubscriptions}</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Mes actual (UTC) — eventos
            </h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600">Ingresos aprox.</dt>
                <dd className="font-medium">{metrics.monthlyRevenue}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600">Churn snapshot</dt>
                <dd className="font-medium">{churnPct}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600">Nuevas suscripciones</dt>
                <dd className="font-medium">{metrics.newSubscriptions}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-600">Pagos confirmados</dt>
                <dd className="font-medium">{metrics.paymentSuccessCount}</dd>
              </div>
            </dl>
          </div>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Timeline por usuario
        </h2>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            placeholder="UUID de usuario"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm sm:max-w-md"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => void loadTimeline()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Ver eventos
          </button>
        </div>

        {timelineError && (
          <p className="mb-3 text-sm text-red-700" role="alert">
            {timelineError}
          </p>
        )}

        <SubscriptionTimeline
          events={events}
          loading={timelineLoading}
          emptyMessage="Introduce un UUID y pulsa Ver eventos, o revisa si no hay historia."
        />
      </section>
    </main>
  );
}
