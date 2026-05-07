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

type FunnelDashboard = {
  windowDays: number;
  visits: number;
  signups: number;
  viewPricing: number;
  upgrades: number;
  startCheckout: number;
  payments: number;
  calls: number;
  conversionRates: {
    signupPerVisit: number | null;
    pricingPerSignup: number | null;
    upgradePerPricing: number | null;
    checkoutPerUpgrade: number | null;
    paymentPerCheckout: number | null;
    callPerPayment: number | null;
  };
  experimentPricingUpgradeCta: {
    experimentKey: string;
    variants: Record<
      string,
      {
        viewPricingActors: number;
        clickUpgradeActors: number;
        clickThroughRate: number | null;
      }
    >;
  };
};

type GrowthRetention = {
  cohortLookbackDays: number;
  definition: string;
  buckets: {
    days: number;
    cohortEligible: number;
    retained: number;
    rate: number | null;
    note: string;
  }[];
};

function pct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

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
  const [funnel, setFunnel] = useState<FunnelDashboard | null>(null);
  const [retention, setRetention] = useState<GrowthRetention | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [s, a, f, r] = await Promise.all([
        adminGet<GrowthSummary>('/api/admin/growth/summary'),
        adminGet<GrowthAlert[]>('/api/admin/growth/alerts'),
        adminGet<FunnelDashboard>('/api/admin/growth/funnel'),
        adminGet<GrowthRetention>('/api/admin/growth/retention?days=1,7,30'),
      ]);
      setSummary(s);
      setAlerts(a);
      setFunnel(f);
      setRetention(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setSummary(null);
      setAlerts([]);
      setFunnel(null);
      setRetention(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const variantRows = funnel
    ? Object.entries(funnel.experimentPricingUpgradeCta.variants).sort((a, b) => a[0].localeCompare(b[0]))
    : [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Growth</h1>
          <p className="text-sm text-slate-600">
            Embudo, retención, experimento pricing CTA, alertas (product_events + suscripciones)
          </p>
        </div>
        <nav className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/pricing"
            className="text-slate-600 underline hover:text-slate-900"
          >
            Pricing (live experiment)
          </Link>
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

      {!loading && !error && summary && funnel && retention && (
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
            <h2 className="mb-3 text-sm font-semibold uppercase text-slate-700">
              Embudo operativo ({funnel.windowDays}d)
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              VISIT_MARKETING (anon permitido), SIGNUP, VIEW_PRICING, CLICK_UPGRADE_CTA, START_CHECKOUT,
              PAYMENT_SUCCESS, START_CALL.
            </p>
            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Visitas" value={funnel.visits} />
              <Metric label="Signups" value={funnel.signups} />
              <Metric label="View pricing" value={funnel.viewPricing} />
              <Metric label="Click upgrade" value={funnel.upgrades} />
              <Metric label="Start checkout" value={funnel.startCheckout} />
              <Metric label="Pagos OK" value={funnel.payments} />
              <Metric label="Start call" value={funnel.calls} />
            </div>
            <h3 className="mb-2 text-xs font-semibold uppercase text-slate-600">
              Tasas paso a paso
            </h3>
            <ul className="grid gap-2 text-sm text-slate-800 sm:grid-cols-2">
              <li>Signup / visita: {pct(funnel.conversionRates.signupPerVisit)}</li>
              <li>Pricing / signup: {pct(funnel.conversionRates.pricingPerSignup)}</li>
              <li>Upgrade CTA / pricing: {pct(funnel.conversionRates.upgradePerPricing)}</li>
              <li>Checkout / upgrade: {pct(funnel.conversionRates.checkoutPerUpgrade)}</li>
              <li>Pago / checkout: {pct(funnel.conversionRates.paymentPerCheckout)}</li>
              <li>Call / pago: {pct(funnel.conversionRates.callPerPayment)}</li>
            </ul>
          </section>

          <section className="mb-10 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold uppercase text-slate-700">
              Experimento {funnel.experimentPricingUpgradeCta.experimentKey}
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Requiere <code className="text-xs">properties.experimentKey</code> +{' '}
              <code className="text-xs">variant</code> en VIEW_PRICING_PAGE y CLICK_UPGRADE_CTA
              (emite desde <code className="text-xs">/pricing</code>).
            </p>
            {variantRows.length === 0 ? (
              <p className="text-sm text-slate-600">Sin exposiciones etiquetadas aún.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-max text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-2 py-2">Variante</th>
                      <th className="px-2 py-2 tabular-nums">Vistas pricing</th>
                      <th className="px-2 py-2 tabular-nums">Clicks</th>
                      <th className="px-2 py-2 tabular-nums">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variantRows.map(([variant, stats]) => (
                      <tr key={variant} className="border-b border-slate-100">
                        <td className="px-2 py-2 font-mono text-xs">{variant}</td>
                        <td className="px-2 py-2 tabular-nums">{stats.viewPricingActors}</td>
                        <td className="px-2 py-2 tabular-nums">{stats.clickUpgradeActors}</td>
                        <td className="px-2 py-2 tabular-nums">
                          {pct(stats.clickThroughRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mb-10 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold uppercase text-slate-700">
              Retención (post primer START_CALL)
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Ventana cohorte últimos {retention.cohortLookbackDays}d · {retention.definition}
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-max text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-2 py-2">Día</th>
                    <th className="px-2 py-2 tabular-nums">Elegibles</th>
                    <th className="px-2 py-2 tabular-nums">Activos</th>
                    <th className="px-2 py-2 tabular-nums">Tasa</th>
                  </tr>
                </thead>
                <tbody>
                  {retention.buckets.map((b) => (
                    <tr key={b.days} className="border-b border-slate-100">
                      <td className="px-2 py-2">D{b.days}</td>
                      <td className="px-2 py-2 tabular-nums">{b.cohortEligible}</td>
                      <td className="px-2 py-2 tabular-nums">{b.retained}</td>
                      <td className="px-2 py-2 tabular-nums">{pct(b.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mb-10 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase text-slate-700">
              Todos los eventos (usuarios únicos · últimos {summary.windowDays} días)
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
                Aún sin eventos en <code className="text-xs">product_events</code>. Usa{' '}
                <code className="text-xs">/pricing</code> y flujos de pago/consulta.
              </p>
            )}
          </section>

          <section className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            API: <code className="font-mono">GET /api/admin/growth/funnel</code>,{' '}
            <code className="font-mono">GET /api/admin/growth/retention?days=1,7,30</code>. Flags:{' '}
            <code className="font-mono">GET/PATCH /api/admin/feature-flags</code>. Experiments:{' '}
            <code className="font-mono">GET/PATCH /api/admin/experiments</code>.
          </section>
        </>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50/80 p-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
