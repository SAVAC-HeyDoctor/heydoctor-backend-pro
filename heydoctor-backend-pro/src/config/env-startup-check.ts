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
      value: env.redisUrl
        ? 'set (cache/throttle + distributed incident correlation)'
        : 'memory cache / in-memory throttle / in-memory alert correlation',
    },
    {
      name: 'INCIDENT_CORRELATION_REDIS',
      status: process.env.INCIDENT_CORRELATION_REDIS ? 'SET' : 'DEFAULT',
      required: false,
      value:
        process.env.INCIDENT_CORRELATION_REDIS === 'false'
          ? 'disabled (always in-memory incident map)'
          : env.redisUrl
            ? 'Redis when REDIS_URL is set'
            : 'omitted (in-memory until Redis configured)',
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
      name: 'SLACK_WEBHOOK_URL',
      status: process.env.SLACK_WEBHOOK_URL?.trim() ? 'SET' : 'DEFAULT',
      required: false,
      value: process.env.SLACK_WEBHOOK_URL?.trim()
        ? 'configured'
        : 'unset (alerts only to other sinks)',
    },
    {
      name: 'ALERT_MAX_PER_MINUTE',
      status: process.env.ALERT_MAX_PER_MINUTE ? 'SET' : 'DEFAULT',
      required: false,
      value: process.env.ALERT_MAX_PER_MINUTE ?? '10 (per instance)',
    },
    {
      name: 'INCIDENT_IDLE_TTL_MS',
      status: process.env.INCIDENT_IDLE_TTL_MS ? 'SET' : 'DEFAULT',
      required: false,
      value:
        process.env.INCIDENT_IDLE_TTL_MS ?? '300000 (5m idle → drop incident)',
    },
    {
      name: 'ALERT_INCIDENT_RESOLUTION_SLACK',
      status: process.env.ALERT_INCIDENT_RESOLUTION_SLACK ? 'SET' : 'DEFAULT',
      required: false,
      value:
        process.env.ALERT_INCIDENT_RESOLUTION_SLACK === 'true'
          ? 'ping Slack when multi-hit incident goes quiet'
          : 'false',
    },
    {
      name: 'GROWTH_BUSINESS_ALERTS_ENABLED',
      status: process.env.GROWTH_BUSINESS_ALERTS_ENABLED ? 'SET' : 'DEFAULT',
      required: false,
      value:
        process.env.GROWTH_BUSINESS_ALERTS_ENABLED === 'false'
          ? 'disabled'
          : 'enabled (daily cron)',
    },
    {
      name: 'GROWTH_ALERT_CHURN_MAX',
      status: process.env.GROWTH_ALERT_CHURN_MAX ? 'SET' : 'DEFAULT',
      required: false,
      value: process.env.GROWTH_ALERT_CHURN_MAX ?? '0.15 (default)',
    },
    {
      name: 'GROWTH_ALERT_SIGNUP_CONVERSION_MIN',
      status: process.env.GROWTH_ALERT_SIGNUP_CONVERSION_MIN
        ? 'SET'
        : 'DEFAULT',
      required: false,
      value: process.env.GROWTH_ALERT_SIGNUP_CONVERSION_MIN ?? '0.05 (default)',
    },
    {
      name: 'TYPEORM_LOG_QUERIES',
      status: process.env.TYPEORM_LOG_QUERIES ? 'SET' : 'DEFAULT',
      required: false,
      value:
        process.env.TYPEORM_LOG_QUERIES === 'true'
          ? 'query+error logging enabled'
          : 'omitted (dev: all logs; prod: errors only unless true)',
    },
    {
      name: 'BUSINESS_ALERT_REVENUE_DROP_RATIO',
      status: process.env.BUSINESS_ALERT_REVENUE_DROP_RATIO ? 'SET' : 'DEFAULT',
      required: false,
      value: process.env.BUSINESS_ALERT_REVENUE_DROP_RATIO ?? '0.7',
    },
    {
      name: 'BUSINESS_ALERT_REVENUE_MIN_PRIOR_CLP',
      status: process.env.BUSINESS_ALERT_REVENUE_MIN_PRIOR_CLP
        ? 'SET'
        : 'DEFAULT',
      required: false,
      value: process.env.BUSINESS_ALERT_REVENUE_MIN_PRIOR_CLP ?? '1000',
    },
    {
      name: 'BUSINESS_ALERT_NO_PAYMENTS_HOUR_UTC',
      status: process.env.BUSINESS_ALERT_NO_PAYMENTS_HOUR_UTC
        ? 'SET'
        : 'DEFAULT',
      required: false,
      value: process.env.BUSINESS_ALERT_NO_PAYMENTS_HOUR_UTC ?? '8',
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
