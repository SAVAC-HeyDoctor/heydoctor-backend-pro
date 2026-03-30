import { ConfigService } from '@nestjs/config';

/**
 * Typed, centralized environment configuration.
 * Single source of truth for all env vars used across the app.
 *
 * Categories:
 * - CORE: DB, port, node_env
 * - AUTH: JWT secret
 * - CORS: allowed origins
 * - PAYKU: payment provider
 * - AI: OpenAI integration
 * - COMPLIANCE: HIPAA mode
 * - URLS: frontend/backend public URLs
 */
export class EnvConfig {
  // ── CORE ──
  readonly nodeEnv: string;
  readonly port: number;
  readonly databaseUrl: string;

  // ── AUTH ──
  readonly jwtSecret: string;

  // ── CORS ──
  readonly corsOrigin: string[];

  // ── CACHE / REDIS (optional) ──
  readonly redisUrl: string | null;

  // ── PAYKU ──
  readonly paykuApiUrl: string | null;
  readonly paykuApiKey: string | null;
  readonly paykuWebhookSecret: string | null;
  readonly paykuWebhookBearer: string | null;
  readonly paykuWebhookAllowUnsafeLocal: boolean;
  readonly consultationPaymentAmountClp: number;
  readonly paymentPendingExpireMinutes: number;

  // ── AI ──
  readonly openaiApiKey: string | null;
  readonly openaiModel: string;

  // ── COMPLIANCE ──
  readonly hipaaMode: boolean;

  // ── URLS ──
  readonly frontendUrl: string;
  readonly backendPublicUrl: string;

  constructor(config: ConfigService) {
    this.nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
    this.port = Number.parseInt(config.get<string>('PORT') ?? '3001', 10);

    const dbUrl =
      config.get<string>('DATABASE_PUBLIC_URL') ??
      config.get<string>('DATABASE_URL') ??
      '';
    this.databaseUrl = dbUrl;

    this.jwtSecret = config.get<string>('JWT_SECRET') ?? '';
    this.corsOrigin = (config.get<string>('CORS_ORIGIN') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const redisUrlRaw = config.get<string>('REDIS_URL')?.trim();
    this.redisUrl = redisUrlRaw && redisUrlRaw.length > 0 ? redisUrlRaw : null;

    this.paykuApiUrl = config.get<string>('PAYKU_API_URL') ?? null;
    this.paykuApiKey = config.get<string>('PAYKU_API_KEY') ?? null;
    this.paykuWebhookSecret =
      config.get<string>('PAYKU_WEBHOOK_SECRET') ?? null;
    this.paykuWebhookBearer =
      config.get<string>('PAYKU_WEBHOOK_BEARER') ?? null;
    this.paykuWebhookAllowUnsafeLocal =
      config.get<string>('PAYKU_WEBHOOK_ALLOW_UNSAFE_LOCAL') === 'true';
    this.consultationPaymentAmountClp = Number(
      config.get<string>('CONSULTATION_PAYMENT_AMOUNT_CLP') ?? '15000',
    );
    this.paymentPendingExpireMinutes = Number(
      config.get<string>('PAYMENT_PENDING_EXPIRE_MINUTES') ?? '1440',
    );

    this.openaiApiKey = config.get<string>('OPENAI_API_KEY') ?? null;
    this.openaiModel =
      config.get<string>('OPENAI_MODEL')?.trim() || 'gpt-4o-mini';

    this.hipaaMode =
      config.get<string>('HIPAA_MODE')?.toLowerCase() === 'true';

    this.frontendUrl =
      config.get<string>('FRONTEND_URL') ?? 'https://heydoctor.vercel.app';
    this.backendPublicUrl =
      config.get<string>('BACKEND_PUBLIC_URL') ??
      'https://heydoctor-backend-pro-production.up.railway.app';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }
}

export const ENV_CONFIG_TOKEN = 'ENV_CONFIG';
