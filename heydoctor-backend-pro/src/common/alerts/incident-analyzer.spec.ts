import { analyzeIncident } from './incident-analyzer';

describe('analyzeIncident', () => {
  it('clasifica pagos', () => {
    const t = analyzeIncident({
      event: 'subscription_payment_failed',
      alertDedupeKey: 'payment_failed:user:uuid',
    });
    expect(t).toMatch(/pago|Payku/i);
  });

  it('clasifica 500', () => {
    expect(
      analyzeIncident({
        event: 'server_error',
        path: '/api/x',
      }),
    ).toMatch(/5xx|internos/i);
  });
});
