'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { usePricingUpgradeExperiment } from '../../hooks/usePricingUpgradeExperiment';
import {
  GrowthTrackEvent,
  startGrowthPricingCheckout,
  trackAuthedOrPublic,
} from '../../lib/growth';

const EXPERIMENT_KEY = 'pricing_upgrade_cta';

function PricingContent() {
  const searchParams = useSearchParams();
  const paymentOk = searchParams.get('payment') === 'success';
  const { variant, anonSessionId, ready } = usePricingUpgradeExperiment();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || anonSessionId.length < 12) return;
    void trackAuthedOrPublic(
      GrowthTrackEvent.VIEW_PRICING_PAGE,
      {
        experimentKey: EXPERIMENT_KEY,
        variant,
      },
      anonSessionId,
    );
  }, [ready, variant, anonSessionId]);

  const buttonText =
    variant === 'A' ? 'Upgrade a PRO' : 'Empieza tu consulta PRO ahora';

  const handleUpgrade = async () => {
    if (!ready || anonSessionId.length < 12 || busy) return;
    setError(null);
    setBusy(true);
    try {
      await trackAuthedOrPublic(
        GrowthTrackEvent.CLICK_UPGRADE_CTA,
        { experimentKey: EXPERIMENT_KEY, variant },
        anonSessionId,
      );
      const { checkoutUrl } = await startGrowthPricingCheckout({
        plan: 'pro',
        anonSessionId,
        experimentKey: EXPERIMENT_KEY,
        variant,
      });
      window.location.href = checkoutUrl;
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : 'No se pudo iniciar el pago');
    }
  };

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

      {paymentOk && (
        <div
          role="status"
          className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
        >
          Pago recibido. Si iniciaste sesión más tarde, tu plan PRO aparecerá en el panel; el
          webhook puede tardar unos segundos.
        </div>
      )}

      <h1 className="mb-4 text-xl font-semibold text-slate-900">Planes HeyDoctor PRO</h1>
      <p className="mb-6 text-sm text-slate-600">
        Variante experimento «{EXPERIMENT_KEY}»: <strong>{variant}</strong>. Pago seguro con Payku
        (sin pasar obligatoriamente por el panel).
      </p>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="mb-4 text-lg font-medium text-slate-800">PRO · Teleconsulta y toolkit clínico</p>
        <p className="mb-6 text-sm text-slate-600">
          Redirige a Payku para completar el cobro; vuelves a esta página al terminar.
        </p>

        {error && (
          <p className="mb-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={!ready || anonSessionId.length < 12 || busy}
          className="w-full rounded-lg bg-slate-800 px-4 py-3 text-center font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          onClick={() => void handleUpgrade()}
        >
          {busy ? 'Abriendo checkout…' : buttonText}
        </button>
        {!ready && (
          <p className="mt-2 text-xs text-slate-500">Preparando variante del experimento…</p>
        )}
      </div>
    </main>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<p className="px-4 py-12 text-sm text-slate-600">Cargando pricing…</p>}>
      <PricingContent />
    </Suspense>
  );
}
