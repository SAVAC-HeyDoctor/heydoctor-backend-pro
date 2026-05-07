'use client';

import { useEffect, useRef } from 'react';
import {
  getGrowthAnonSessionId,
  GrowthTrackEvent,
  trackProductEventPublic,
} from '../lib/growth';

/** Dispara VISIT_MARKETING una vez (anon) al cargar landing. */
export function GrowthLandingVisitBeacon() {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const anonSessionId = getGrowthAnonSessionId();
    if (anonSessionId.length < 12) return;
    void trackProductEventPublic(GrowthTrackEvent.VISIT_MARKETING, {
      anonSessionId,
      path: '/',
    });
  }, []);

  return null;
}
