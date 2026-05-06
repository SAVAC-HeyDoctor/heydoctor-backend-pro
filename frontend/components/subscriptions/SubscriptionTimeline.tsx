'use client';

import type { SubscriptionEventRow } from './types';

function formatDateIso(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const LABELS: Partial<Record<string, string>> = {
  PAYMENT_SUCCEEDED: 'Pago confirmado',
  PAYMENT_FAILED: 'Pago fallido',
  ADMIN_UPDATED: 'Plan actualizado por admin',
  SUBSCRIPTION_CREATED: 'Suscripción creada',
  WEBHOOK_RECEIVED: 'Webhook Payku recibido',
  SUBSCRIPTION_ACTIVATED: 'Suscripción activada',
  SUBSCRIPTION_DEACTIVATED: 'Suscripción desactivada',
  SUBSCRIPTION_EXPIRED: 'Suscripción expirada',
  PLAN_UPGRADED: 'Plan mejorado',
  PLAN_DOWNGRADED: 'Plan reducido',
};

export type SubscriptionTimelineProps = {
  events: SubscriptionEventRow[];
  loading?: boolean;
  emptyMessage?: string;
};

export function SubscriptionTimeline({
  events,
  loading,
  emptyMessage = 'Sin eventos',
}: SubscriptionTimelineProps) {
  if (loading) {
    return <p className="text-sm text-slate-600">Cargando historial…</p>;
  }

  if (events.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <ul className="space-y-3">
      {events.map((e) => (
        <li
          key={e.id}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
        >
          <p className="font-medium text-slate-900">
            {LABELS[e.eventType] ?? e.eventType}
          </p>
          <p className="text-xs text-slate-500">
            {formatDateIso(e.createdAt)}
            {e.source ? ` · fuente ${e.source}` : ''}
          </p>
          {(e.previousPlan != null ||
            e.newPlan != null ||
            e.previousStatus != null ||
            e.newStatus != null) && (
            <p className="mt-1 text-xs text-slate-600">
              {e.previousPlan != null || e.newPlan != null
                ? `plan ${e.previousPlan ?? '—'} → ${e.newPlan ?? '—'}`
                : ''}
              {e.previousPlan != null || e.newPlan != null
                ? e.previousStatus != null || e.newStatus != null
                  ? ' · '
                  : ''
                : ''}
              {e.previousStatus != null || e.newStatus != null
                ? `estado ${e.previousStatus ?? '—'} → ${e.newStatus ?? '—'}`
                : ''}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
