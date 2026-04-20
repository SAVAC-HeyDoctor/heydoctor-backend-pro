/** Respuesta de GET /consultations/consultation-price (sin llamadas a Payku). */
export type ConsultationPriceResponse = {
  amountClp: number;
  currency: 'CLP';
  /** `config` = CONSULTATION_PAYMENT_AMOUNT_CLP; `default` = fallback 15000. */
  source: 'config' | 'default';
};

export const DEFAULT_CONSULTATION_PRICE_CLP = 15_000;
