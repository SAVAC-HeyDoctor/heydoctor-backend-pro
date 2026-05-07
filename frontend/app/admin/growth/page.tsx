'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { getApiBase } from '../../../lib/api-client';
import { apiFetchWithRefresh } from '../../../lib/session-fetch';

type GrowthSummary = {
  windowDays: number;
  funnelDistinctUsers: Record<string, number>;
  signupToPaidApprox: number;
  signupToPaidNote: string;
  subscriptionTotals: {
    totalUsers: number;
    proUsers: number;
    conversionProVsUsersApprox: number;
  };
};

type GrowthAlert = {
  code: string;
  severity: string;
  message: string;
  value?: number;
};

async function adminGet<T>(path: string): Promise<T> {
  const base = getApiBase();
  const res = await apiFetchWithRefresh(`${base}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status}: ${t.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export default function AdminGrowthPage() {
  const [summary, setSummary] = useState<GrowthSummary | null>(null);
  const [alerts, setAlerts] = useState<GrowthAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [s, a] = await Promise.all([
        adminGet<GrowthSummary>('/api/admin/growth/summary'),
        adminGet<GrowthAlert[]>('/api/admin/growth/alerts'),
      ]);
      setSummary(s);
      setAlerts(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setSummary(null);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Growth</h1>
          <p className="text-sm text-slate-600">
            Embudo, alertas y conversión (product_events + suscripciones)
          </p>
        </div>
        <nav className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/admin/analytics"
            className="text-slate-600 underline hover:text-slate-900"
          >
            Analytics SaaS
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
        <p className="text-sm text-slate-600">Cargando growth…</p>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          {error}
        </div>
      )}

      {!loading && !error && summary && (
        <>
          {alerts.length > 0 && (
            <section className="mb-8 rounded-lg border border-red-100 bg-red-50/70 p-4">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-red-900">
                Alertas
              </h2>
              <ul className="space-y-2 text-sm text-red-950">
                {alerts.map((x) => (
                  <li key={x.code}>
                    <strong>{x.code}</strong> ({x.severity}
                    {x.value != null
                      ? ` · ${(x.value * 100).toFixed(2)}%`
                      : ''}
                    ) · {x.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-slate-500">
                Conversión PRO / usuarios
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {(summary.subscriptionTotals.conversionProVsUsersApprox * 100).toFixed(2)}
                %
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {summary.subscriptionTotals.proUsers} PRO /{' '}
                {summary.subscriptionTotals.totalUsers} usuarios
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-slate-500">
                Signup → pago (aprox.)
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {(summary.signupToPaidApprox * 100).toFixed(2)}%
              </p>
              <p className="mt-1 text-xs text-slate-600">Ventana {summary.windowDays}d</p>
            </div>
          </section>

          <section className="mb-10 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase text-slate-700">
              Embudo (usuarios únicos · últimos {summary.windowDays} días)
            </h2>
            <p className="mb-4 text-xs text-slate-500">{summary.signupToPaidNote}</p>
            <div className="overflow-x-auto">
              <table className="min-w-max text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-2 py-2">Evento</th>
                    <th className="px-2 py-2 tabular-nums">Usuarios</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.funnelDistinctUsers)
                    .filter(([, c]) => c > 0)
                    .map(([name, cnt]) => (
                      <tr key={name} className="border-b border-slate-100">
                        <td className="px-2 py-2 font-mono text-xs">{name}</td>
                        <td className="px-2 py-2 tabular-nums">{cnt}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {Object.values(summary.funnelDistinctUsers).every((c) => c === 0) && (
              <p className="text-sm text-slate-600">
                Aún sin eventos en <code className="text-xs">product_events</code>. Emite desde el
                cliente con <code className="text-xs">trackProductEvent()</code>{' '}
                (<code className="text-xs">lib/growth.ts</code>).
              </p>
            )}
          </section>

          <section className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Flags y experiments:{' '}
            <code className="font-mono">GET/PATCH /api/admin/feature-flags</code>,{' '}
            <code className="font-mono">GET/PATCH /api/admin/experiments</code>. Contexto
            cliente:{' '}
            <code className="font-mono">/api/growth/context</code>.
          </section>
        </>
      )}
    </main>
  );
}
