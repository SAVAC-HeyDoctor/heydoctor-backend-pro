import { createHmac, timingSafeEqual } from 'crypto';
import { Logger, UnauthorizedException } from '@nestjs/common';

const logger = new Logger('PaykuWebhookAuth');

function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sorted.map(
    (k) =>
      JSON.stringify(k) +
      ':' +
      stableStringify((obj as Record<string, unknown>)[k]),
  );
  return '{' + pairs.join(',') + '}';
}

function verifyHmac(body: unknown, signature: string, secret: string): boolean {
  const payload = stableStringify(body);
  const expected = createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
  return secureCompareHex(expected, signature);
}

/** HMAC sobre los bytes exactos del cuerpo (Payku y muchos PSP firman el raw body). */
function verifyHmacRaw(
  rawBody: Buffer,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return secureCompareHex(expected, signature);
}

function secureCompareHex(expectedHex: string, signature: string): boolean {
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expectedHex, 'hex');
  if (sigBuf.length !== expBuf.length) return false;
  return timingSafeEqual(sigBuf, expBuf);
}

export type PaykuWebhookAuthConfig = {
  webhookSecret?: string;
  webhookBearer?: string;
  allowUnsafeLocal: boolean;
  nodeEnv: string;
};

/**
 * Multi-layer webhook authentication for Payku.
 *
 * - If PAYKU_WEBHOOK_SECRET → verify HMAC SHA-256 via X-Payku-Signature / X-Signature
 * - If PAYKU_WEBHOOK_BEARER → verify Authorization: Bearer
 * - If both → both must pass
 * - If neither → reject, unless explicitly opted-in for local dev
 *
 * Firma HMAC: si `rawBody` está presente (Nest `rawBody: true`), se valida sobre el
 * buffer exacto; si no, fallback a canonical JSON (`stableStringify(body)`).
 */
export function assertPaykuWebhookAuthenticated(
  headers: Record<string, string | string[] | undefined>,
  body: unknown,
  config: PaykuWebhookAuthConfig,
  rawBody?: Buffer,
): void {
  const { webhookSecret, webhookBearer, allowUnsafeLocal, nodeEnv } = config;

  const hasSecretConfig = !!webhookSecret;
  const hasBearerConfig = !!webhookBearer;

  if (!hasSecretConfig && !hasBearerConfig) {
    if (allowUnsafeLocal && nodeEnv !== 'production') {
      logger.warn(
        'Payku webhook auth SKIPPED: PAYKU_WEBHOOK_ALLOW_UNSAFE_LOCAL=true (non-production)',
      );
      return;
    }
    logger.error(
      'Payku webhook rejected: no auth configured and unsafe local not allowed',
    );
    throw new UnauthorizedException('Webhook authentication not configured');
  }

  if (hasSecretConfig) {
    const sig =
      firstHeader(headers['x-payku-signature']) ??
      firstHeader(headers['x-signature']);

    if (!sig) {
      throw new UnauthorizedException(
        'Missing X-Payku-Signature or X-Signature header',
      );
    }

    const ok =
      rawBody && rawBody.length > 0
        ? verifyHmacRaw(rawBody, sig, webhookSecret)
        : verifyHmac(body, sig, webhookSecret);
    if (!ok) {
      throw new UnauthorizedException('Invalid HMAC signature');
    }
  }

  if (hasBearerConfig) {
    const authHeader = firstHeader(headers['authorization']);
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid Authorization Bearer header',
      );
    }

    const token = authHeader.slice(7);
    const tokenBuf = Buffer.from(token);
    const expectedBuf = Buffer.from(webhookBearer);

    if (
      tokenBuf.length !== expectedBuf.length ||
      !timingSafeEqual(tokenBuf, expectedBuf)
    ) {
      throw new UnauthorizedException('Invalid Bearer token');
    }
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
