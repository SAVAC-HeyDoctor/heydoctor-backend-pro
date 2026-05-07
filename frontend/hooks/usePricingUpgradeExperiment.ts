'use client';

import { useEffect, useState } from 'react';
import {
  fetchExperimentPreview,
  fetchGrowthContextMaybeAuthed,
  getGrowthAnonSessionId,
} from '../lib/growth';

const PRICING_CTA_KEY = 'pricing_upgrade_cta';

/** Variante estable A/B (`pricing_upgrade_cta`): usuario autenticado o preview por anonId. */
export function usePricingUpgradeExperiment(): {
  variant: string;
  anonSessionId: string;
  ready: boolean;
} {
  const [variant, setVariant] = useState('A');
  const [anonSessionId, setAnonSessionId] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAnonSessionId(getGrowthAnonSessionId());
  }, []);

  useEffect(() => {
    if (!anonSessionId || anonSessionId.length < 12) return;
    let cancelled = false;
    (async () => {
      try {
        const ctx = await fetchGrowthContextMaybeAuthed();
        if (ctx) {
          const v =
            (ctx.experiments[PRICING_CTA_KEY] ?? 'A').trim() || 'A';
          if (!cancelled) setVariant(v);
        } else {
          const r = await fetchExperimentPreview(PRICING_CTA_KEY, anonSessionId);
          const v = (r.variant ?? 'A').trim() || 'A';
          if (!cancelled) setVariant(v);
        }
      } catch {
        try {
          const r = await fetchExperimentPreview(PRICING_CTA_KEY, anonSessionId);
          const v = (r.variant ?? 'A').trim() || 'A';
          if (!cancelled) setVariant(v);
        } catch {
          if (!cancelled) setVariant('A');
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [anonSessionId]);

  return { variant, anonSessionId, ready };
}
