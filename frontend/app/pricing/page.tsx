'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePricingUpgradeExperiment } from '../../hooks/usePricingUpgradeExperiment';
import {
  GrowthTrackEvent,
  trackAuthedOrPublic,
} from '../../lib/growth';

export default function PricingPage() {
  const { variant, anonSessionId, ready } = usePricingUpgradeExperiment();

  useEffect(() => {
    if (!ready || anonSessionId.length < 12) return;
    void trackAuthedOrPublic(
      GrowthTrackEvent.VIEW_PRICING_PAGE,
      {
        experimentKey: 'pricing_upgrade_cta',
        variant,
      },
      anonSessionId,
    );
  }, [ready, variant, anonSessionId]);

  const buttonText =
    variant === 'A' ? 'Upgrade a PRO' : 'Empieza tu consulta PRO ahora';

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <div className="mb-8 flex flex-wrap justify-between gap-3 text-sm">
        <Link href="/" className="text-slate-600 underline hover:text-slate-900">
          Inicio
        </Link>
        <Link href="/login" className="text-slate-600 underline hover:text-slate-900">
          Iniciar sesión
        </Link>
        <Link href="/panel" className="text-slate-600 underline hover:text-slate-900">
          Panel
        </Link>
      </div>

      <h1 className="mb-4 text-xl font-semibold text-slate-900">Planes HeyDoctor PRO</h1>
      <p className="mb-6 text-sm text-slate-600">
        Experimento activo «pricing_upgrade_cta» (variante {variant}). El CTA cambia según el
        tráfico asignado; los eventos alimentan el embudo en /admin/growth.
      </p>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-4 text-lg font-medium text-slate-800">PRO · Teleconsulta y toolkit clínico</p>
        <p className="mb-6 text-sm text-slate-600">
          Checkout y suscripción siguen desde el panel tras iniciar sesión.
        </p>
        <button
          type="button"
          className="w-full rounded-lg bg-slate-800 px-4 py-3 text-center font-medium text-white hover:bg-slate-700"
          onClick={() => {
            void trackAuthedOrPublic(
              GrowthTrackEvent.CLICK_UPGRADE_CTA,
              { experimentKey: 'pricing_upgrade_cta', variant },
              anonSessionId,
            );
            window.location.assign('/panel');
          }}
        >
          {buttonText}
        </button>
      </div>
    </main>
  );
}
