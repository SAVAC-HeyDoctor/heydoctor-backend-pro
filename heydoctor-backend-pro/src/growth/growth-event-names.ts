/** Nombres de eventos recomendados para embudos growth (product_events). */
export const GrowthFunnelEvents = {
  VISIT_MARKETING: 'VISIT_MARKETING',
  SIGNUP_COMPLETED: 'SIGNUP_COMPLETED',
  CLICK_UPGRADE: 'CLICK_UPGRADE',
  PAYMENT_SUCCESS: 'PAYMENT_SUCCESS',
  START_CALL: 'START_CALL',
  FIRST_CALL_COMPLETED: 'FIRST_CALL_COMPLETED',
  /** Ciclo vida suscripción — también llegan desde subscription_events. */
  SUBSCRIPTION_UPGRADE: 'SUBSCRIPTION_UPGRADE',
} as const;

/** Nombres de eventos recomendados (extiende con strings en product_events). */
export type GrowthProductEventName =
  (typeof GrowthFunnelEvents)[keyof typeof GrowthFunnelEvents];
