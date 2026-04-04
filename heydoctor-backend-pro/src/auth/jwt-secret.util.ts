import { ConfigService } from '@nestjs/config';

/**
 * Secreto compartido por `JwtModule` (firma en login/refresh) y `JwtStrategy`
 * (verificación en /auth/me). Debe ser exactamente el mismo string.
 *
 * Railway: una sola variable `JWT_SECRET` por servicio; todas las réplicas el mismo valor.
 * Evita comillas literales en el valor (si la UI ya envuelve el secret, no dupliques "..." ).
 */
export function resolveJwtSecret(config: ConfigService): string {
  const raw = config.get<string | undefined>('JWT_SECRET');
  let secret = typeof raw === 'string' ? raw.trim() : '';

  if (
    secret.length >= 2 &&
    ((secret.startsWith('"') && secret.endsWith('"')) ||
      (secret.startsWith("'") && secret.endsWith("'")))
  ) {
    secret = secret.slice(1, -1).trim();
  }

  if (!secret) {
    throw new Error(
      'JWT_SECRET is required: login signs with JwtModule and /auth/me verifies with JwtStrategy using this same value.',
    );
  }

  return secret;
}
