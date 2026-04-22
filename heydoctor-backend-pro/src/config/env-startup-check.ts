import { Logger } from '@nestjs/common';
import type { EnvConfig } from './env.config';

const envLogger = new Logger('EnvStartup');

type EnvVarStatus = {
  name: string;
  status: 'SET' | 'MISSING' | 'DEFAULT';
  required: boolean;
  value?: string;
};

/**
 * Logs environment configuration at startup without exposing secrets.
 * Returns list of missing required vars for early failure.
 */
export function validateAndLogEnv(env: EnvConfig): string[] {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET?.trim()) {
      throw new Error('Missing JWT_SECRET');
    }
    if (!process.env.DATABASE_URL?.trim()) {
      throw new Error('Missing DATABASE_URL');
    }
  }

  const vars: EnvVarStatus[] = [
    {
      name: 'NODE_ENV',
      status: env.nodeEnv ? 'SET' : 'DEFAULT',
      required: false,
      value: env.nodeEnv,
    },
    { name: 'PORT', status: 'SET', required: false, value: String(env.port) },
    {
      name: 'DATABASE_URL',
      status: env.databaseUrl ? 'SET' : 'MISSING',
      required: true,
    },
    {
      name: 'JWT_SECRET',
      status: env.jwtSecret ? 'SET' : 'MISSING',
      required: true,
    },
    {
      name: 'CORS_ORIGIN',
      status: env.corsOrigin.length > 0 ? 'SET' : 'DEFAULT',
      required: false,
      value:
        env.corsOrigin.length > 0
          ? `${env.corsOrigin.length} origins`
          : 'default localhost:3000',
    },
    {
      name: 'REDIS_URL',
      status: env.redisUrl ? 'SET' : 'DEFAULT',
      required: false,
      value: env.redisUrl ? 'set' : 'memory cache / in-memory throttle',
    },
    {
      name: 'PAYKU_API_URL',
      status: env.paykuApiUrl ? 'SET' : 'MISSING',
      required: false,
    },
    {
      name: 'PAYKU_API_KEY',
      status: env.paykuApiKey ? 'SET' : 'MISSING',
      required: false,
    },
    {
      name: 'PAYKU_WEBHOOK_SECRET',
      status: env.paykuWebhookSecret ? 'SET' : 'MISSING',
      required: false,
    },
    {
      name: 'PAYKU_WEBHOOK_BEARER',
      status: env.paykuWebhookBearer ? 'SET' : 'MISSING',
      required: false,
    },
    {
      name: 'PAYKU_WEBHOOK_ALLOW_UNSAFE_LOCAL',
      status: env.paykuWebhookAllowUnsafeLocal ? 'SET' : 'DEFAULT',
      required: false,
      value: String(env.paykuWebhookAllowUnsafeLocal),
    },
    {
      name: 'CONSULTATION_PAYMENT_AMOUNT_CLP',
      status: 'SET',
      required: false,
      value: String(env.consultationPaymentAmountClp),
    },
    {
      name: 'PAYMENT_PENDING_EXPIRE_MINUTES',
      status: 'SET',
      required: false,
      value: String(env.paymentPendingExpireMinutes),
    },
    {
      name: 'OPENAI_API_KEY',
      status: env.openaiApiKey ? 'SET' : 'MISSING',
      required: false,
    },
    {
      name: 'OPENAI_MODEL',
      status: 'SET',
      required: false,
      value: env.openaiModel,
    },
    {
      name: 'HIPAA_MODE',
      status: env.hipaaMode ? 'SET' : 'DEFAULT',
      required: false,
      value: String(env.hipaaMode),
    },
    {
      name: 'FRONTEND_URL',
      status: 'SET',
      required: false,
      value: env.frontendUrl,
    },
    {
      name: 'BACKEND_PUBLIC_URL',
      status: 'SET',
      required: false,
      value: env.backendPublicUrl,
    },
    {
      name: 'PAYKU_CONSULTATION_PAYMENTS_DISABLED',
      status: env.paykuConsultationPaymentsDisabled ? 'SET' : 'DEFAULT',
      required: false,
      value: String(env.paykuConsultationPaymentsDisabled),
    },
  ];

  if (env.isProduction && env.paykuConsultationPaymentsDisabled) {
    envLogger.warn(
      `payku_mock_mode_production | ${JSON.stringify({
        event: 'payku_mock_mode_production',
        message:
          'PAYKU_CONSULTATION_PAYMENTS_DISABLED=true en producción: pagos usarán URL mock',
      })}`,
    );
  }

  if (process.env.NODE_ENV === 'production') {
    envLogger.log(
      `env_config_validated | ${JSON.stringify({ event: 'env_config_validated', nodeEnv: 'production' })}`,
    );
  } else {
    envLogger.log(
      `env_config_table | ${JSON.stringify({
        event: 'env_config_table',
        rows: vars.map((v) => ({
          name: v.name,
          status: v.status,
          required: v.required,
          value: v.value,
        })),
      })}`,
    );
  }

  const missing = vars.filter((v) => v.required && v.status === 'MISSING');

  if (missing.length > 0) {
    envLogger.error(
      `env_config_missing_required | ${JSON.stringify({
        event: 'env_config_missing_required',
        missing: missing.map((v) => v.name),
      })}`,
    );
  }

  return missing.map((v) => v.name);
}
