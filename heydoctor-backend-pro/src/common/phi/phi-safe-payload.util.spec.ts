import {
  sanitizeErrorMessage,
  sanitizeOutboxPayload,
} from './phi-safe-payload.util';

describe('phi-safe-payload.util', () => {
  it('strips blocked keys and emails from payload', () => {
    const out = sanitizeOutboxPayload({
      paymentId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'patient@example.com',
      name: 'Secret Name',
      metadata: {
        paymentId: '550e8400-e29b-41d4-a716-446655440000',
        incomingPaymentStatus: 'paid',
      },
    });
    expect(out.paymentId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(out.email).toBeUndefined();
    expect(out.metadata).toEqual({
      paymentId: '550e8400-e29b-41d4-a716-446655440000',
      incomingPaymentStatus: 'paid',
    });
  });

  it('redacts emails in error messages', () => {
    expect(sanitizeErrorMessage('failed for user@test.com')).toBe(
      'failed for [redacted]',
    );
  });
});
