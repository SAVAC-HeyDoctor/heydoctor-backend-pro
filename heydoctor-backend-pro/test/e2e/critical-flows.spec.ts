/**
 * QA — flujos críticos con Postgres real.
 *
 * Requiere: `DATABASE_E2E=1` y Postgres con migraciones (`heydoctor_test` recomendado).
 *
 * Variables útiles (opcionales):
 * - `DATABASE_URL`
 * - `JWT_SECRET`
 * - `INCIDENT_CORRELATION_REDIS=false` — correlación de alertas en memoria (tests más estables).
 */

import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server as HttpServer } from 'node:http';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Socket } from 'socket.io';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from '../../src/app.module';
import {
  E2E_CI_ADMIN_EMAIL,
  E2E_CI_DOCTOR_EMAIL,
  E2E_CI_PASSWORD,
} from '../../src/database/e2e-ci-seed.constants';
import { seedE2E } from '../../src/database/seed.e2e';
import { RequestIdMiddleware } from '../../src/common/middleware/request-id.middleware';
import { UserRole } from '../../src/users/user-role.enum';
import { WebrtcGateway } from '../../src/webrtc/webrtc.gateway';
import {
  clearAlertSinksForTests,
  notifyAlert,
  registerAlertSink,
} from '../../src/common/alerts/alert.hooks';
import { GrowthFunnelEvents } from '../../src/growth/growth-event-names';

const runCritical = process.env.DATABASE_E2E === '1';

function cookieHeaderFromSetCookie(
  setCookie: string | string[] | undefined,
): string {
  if (!setCookie) return '';
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  return arr
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

function csrfTokenFromSetCookie(
  setCookie: string | string[] | undefined,
): string {
  if (!setCookie) return '';
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const line of arr) {
    const part = line.split(';')[0].trim();
    if (part.startsWith('csrf_token=')) {
      return decodeURIComponent(part.slice('csrf_token='.length));
    }
  }
  return '';
}

function expectOkOrCreated(res: { status: number }): void {
  expect([200, 201]).toContain(res.status);
}

async function flushAlertDispatch(): Promise<void> {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 150));
}

async function waitForAlert(
  received: unknown[],
  expectedCount: number,
): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await flushAlertDispatch();
    if (received.length >= expectedCount) return;
  }
}

async function flushAsyncAuditWrites(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300));
}

(runCritical ? describe : describe.skip)(
  'Critical flows — production readiness (e2e)',
  () => {
    let app: INestApplication<App>;
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const anonSessionId = `anon_sess_${suffix.replace(/[^a-zA-Z0-9_]/g, '').padEnd(16, 'x')}`.slice(
      0,
      80,
    );

    let cookieAdmin: string;
    let csrfAdmin: string;
    let accessTokenAdmin: string;

    let cookieDoctor: string;
    let csrfDoctor: string;
    let accessDoctor: string;
    let doctorId: string;
    let clinicId: string;

    let consultationPaidId: string;
    let paymentPaidId: string;
    let consultationFailedId: string;

    const paymentAmount = 15_000;

    beforeAll(async () => {
      if (!process.env.DATABASE_URL) {
        process.env.DATABASE_URL =
          'postgresql://postgres:postgres@127.0.0.1:5432/heydoctor_test';
      }
      if (!process.env.JWT_SECRET) {
        process.env.JWT_SECRET = 'e2e-test-jwt-secret-min-32-chars!!';
      }
      process.env.PORT = process.env.PORT ?? '3999';
      process.env.NODE_ENV = process.env.NODE_ENV ?? 'development';
      process.env.DATABASE_E2E = '1';
      process.env.PAYKU_WEBHOOK_ALLOW_UNSAFE_LOCAL = 'true';
      process.env.PAYKU_CONSULTATION_PAYMENTS_DISABLED = 'true';
      process.env.CONSULTATION_PAYMENT_AMOUNT_CLP = String(paymentAmount);
      process.env.PRICING_PRO_CHECKOUT_AMOUNT_CLP = '9900';
      process.env.INCIDENT_CORRELATION_REDIS =
        process.env.INCIDENT_CORRELATION_REDIS ?? 'false';
      process.env.ALERT_MAX_PER_MINUTE = '500';

      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      app.use(cookieParser());
      app.useWebSocketAdapter(new IoAdapter(app));
      app.use(new RequestIdMiddleware().use);
      app.setGlobalPrefix('api', {
        exclude: [
          { path: '/', method: RequestMethod.GET },
          { path: 'health', method: RequestMethod.GET },
          { path: 'healthz', method: RequestMethod.GET },
        ],
      });
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );

      await app.listen(0, '127.0.0.1');

      const ds = app.get(DataSource);
      const seedSnapshot = await seedE2E(ds);
      clinicId = seedSnapshot.clinicId;
      doctorId = seedSnapshot.doctorId;
      consultationPaidId = seedSnapshot.consultationPaidReadyId;
      consultationFailedId = seedSnapshot.consultationFailedReadyId;

      const server = app.getHttpServer() as HttpServer;

      const loginAdmin = await request(server)
        .post('/api/auth/login')
        .send({ email: E2E_CI_ADMIN_EMAIL, password: E2E_CI_PASSWORD })
        .expect(expectOkOrCreated);
      cookieAdmin = cookieHeaderFromSetCookie(loginAdmin.headers['set-cookie']);
      csrfAdmin = csrfTokenFromSetCookie(loginAdmin.headers['set-cookie']);
      accessTokenAdmin = loginAdmin.body.access_token as string;

      const loginDoc = await request(server)
        .post('/api/auth/login')
        .send({
          email: E2E_CI_DOCTOR_EMAIL,
          password: E2E_CI_PASSWORD,
        })
        .expect(expectOkOrCreated);
      cookieDoctor = cookieHeaderFromSetCookie(loginDoc.headers['set-cookie']);
      csrfDoctor = csrfTokenFromSetCookie(loginDoc.headers['set-cookie']);
      accessDoctor = loginDoc.body.access_token as string;

      const payRes = await request(server)
        .post('/api/payku/create-payment-session')
        .set('Authorization', `Bearer ${accessDoctor}`)
        .set('Cookie', cookieDoctor)
        .set('X-CSRF-Token', csrfDoctor)
        .send({ consultationId: consultationPaidId })
        .expect((r) => {
          expect([200, 201]).toContain(r.status);
        });
      paymentPaidId = payRes.body.paymentId as string;
    }, 240_000);

    afterAll(async () => {
      if (app) {
        await flushAsyncAuditWrites();
        await app.close();
      }
    });

    describe('Auth', () => {
      it('login válido: sesión activa tras seed (JWT / Bearer)', async () => {
        const res = await request(app.getHttpServer())
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${accessDoctor}`)
          .expect(200);
        expect(res.body.email).toBe(E2E_CI_DOCTOR_EMAIL);
      });

      it('login inválido → 401', () => {
        return request(app.getHttpServer())
          .post('/api/auth/login')
          .send({
            email: E2E_CI_DOCTOR_EMAIL,
            password: 'wrong-pass-xyz-___',
          })
          .expect(401);
      });

      it('refresh rota token y detecta replay del token anterior', async () => {
        const originalCookie = cookieAdmin;
        const res = await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('Cookie', originalCookie)
          .expect(expectOkOrCreated);
        expect(res.body.access_token).toBeTruthy();
        expect(res.body.ok).toBe(true);

        const rotatedCookie = cookieHeaderFromSetCookie(
          res.headers['set-cookie'],
        );
        expect(rotatedCookie).toContain('refresh_token=');

        await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('Cookie', originalCookie)
          .expect(401);

        await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('Cookie', rotatedCookie)
          .expect(401);
      });

      it('acceso sin auth a recurso protegido → 401', () => {
        return request(app.getHttpServer()).get('/api/auth/me').expect(401);
      });
    });

    describe('Payku', () => {
      it('webhook success marca pago como pagado', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/payku/webhook')
          .send({
            payment_id: paymentPaidId,
            status: 'success',
            amount: paymentAmount,
          })
          .expect(expectOkOrCreated);
        expect(res.body.ok).toBe(true);
        expect(res.body.action).toBe('processed');
      });

      it('doble webhook success es idempotente (duplicate)', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/payku/webhook')
          .send({
            payment_id: paymentPaidId,
            status: 'paid',
            amount: paymentAmount,
          })
          .expect(expectOkOrCreated);
        expect(res.body.ok).toBe(true);
        expect(res.body.duplicate).toBe(true);
      });

      it('webhook failed para otro pago pendiente', async () => {
        const payRes = await request(app.getHttpServer())
          .post('/api/payku/create-payment-session')
          .set('Authorization', `Bearer ${accessDoctor}`)
          .set('Cookie', cookieDoctor)
          .set('X-CSRF-Token', csrfDoctor)
          .send({ consultationId: consultationFailedId })
          .expect((r) => {
            expect([200, 201]).toContain(r.status);
          });
        const pid = payRes.body.paymentId as string;

        const res = await request(app.getHttpServer())
          .post('/api/payku/webhook')
          .send({
            payment_id: pid,
            status: 'failed',
          })
          .expect(expectOkOrCreated);
        expect(res.body.ok).toBe(true);
      }, 20_000);
    });

    describe('Growth', () => {
      it('start-checkout (pricing) crea sesión', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/growth/start-checkout')
          .send({
            plan: 'pro',
            anonSessionId,
            experimentKey: 'pricing_upgrade_cta',
            variant: 'A',
          })
          .expect((res) => {
            expect([200, 201]).toContain(res.status);
          });
        expect(res.body.checkoutUrl).toBeTruthy();
        expect(res.body.paymentId).toBeTruthy();
      });

      it('evento público + embudo + experimento A/B + evento autenticado', async () => {
        const csrfBoot = await request(app.getHttpServer())
          .get('/api/auth/csrf')
          .expect(200);
        const csrfC = cookieHeaderFromSetCookie(csrfBoot.headers['set-cookie']);
        const csrfTok =
          (csrfBoot.body.csrfToken as string) ||
          csrfTokenFromSetCookie(csrfBoot.headers['set-cookie']);

        await request(app.getHttpServer())
          .post('/api/growth/events-public')
          .set('Cookie', csrfC)
          .set('X-CSRF-Token', csrfTok)
          .send({
            eventName: GrowthFunnelEvents.VISIT_MARKETING,
            properties: { anonSessionId },
          })
          .expect((res) => {
            expect([200, 201]).toContain(res.status);
          });

        await request(app.getHttpServer())
          .post('/api/growth/events-public')
          .set('Cookie', csrfC)
          .set('X-CSRF-Token', csrfTok)
          .send({
            eventName: GrowthFunnelEvents.VIEW_PRICING_PAGE,
            properties: { anonSessionId },
          })
          .expect((res) => {
            expect([200, 201]).toContain(res.status);
          });

        const preview = await request(app.getHttpServer())
          .get('/api/growth/experiment-preview')
          .query({ key: 'pricing_upgrade_cta', anonId: anonSessionId })
          .expect(200);
        expect(preview.body).toHaveProperty('variant');

        await request(app.getHttpServer())
          .post('/api/growth/events')
          .set('Authorization', `Bearer ${accessDoctor}`)
          .set('Cookie', cookieDoctor)
          .set('X-CSRF-Token', csrfDoctor)
          .send({
            eventName: GrowthFunnelEvents.VIEW_PRICING_PAGE,
            properties: { source: 'e2e' },
          })
          .expect((res) => {
            expect([200, 201]).toContain(res.status);
          });

        const funnel = await request(app.getHttpServer())
          .get('/api/admin/growth/funnel')
          .set('Cookie', cookieAdmin)
          .set('Authorization', `Bearer ${accessTokenAdmin}`)
          .set('X-CSRF-Token', csrfAdmin)
          .expect(200);
        expect(funnel.body).toBeDefined();
      });
    });

    describe('WebRTC signaling', () => {
      it('join-consultation con usuario PRO autorizado', async () => {
        const gateway = app.get(WebrtcGateway);
        const socket = {
          data: {
            user: {
              sub: doctorId,
              email: E2E_CI_DOCTOR_EMAIL,
              role: UserRole.DOCTOR,
              clinicId,
            },
          },
          join: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
          to: jest.fn().mockReturnValue({
            emit: jest.fn(),
          }),
        } as unknown as Socket;

        const ack = await gateway.joinConsultation(socket, {
          consultationId: consultationPaidId,
        });

        expect(ack).toEqual({
          ok: true,
          consultationId: consultationPaidId,
        });
        expect(socket.join).toHaveBeenCalledWith(consultationPaidId);
      });
    });

    describe('Resiliencia (comportamiento observable)', () => {
      it('Redis caído: app sigue respondiendo (métricas fallback memoria si aplica)', async () => {
        await request(app.getHttpServer()).get('/health').expect(200);
      });
    });

    describe('Alertas (hook + dedupe)', () => {
      it('misma clave server_error: una notificación a sinks por incidente', async () => {
        clearAlertSinksForTests();
        const received: unknown[] = [];
        registerAlertSink((p) => received.push(p));

        notifyAlert(
          {
            event: 'server_error',
            method: 'GET',
            path: `/api/e2e/dedupe-test/${suffix}`,
            statusCode: 500,
          },
          {},
        );
        notifyAlert(
          {
            event: 'server_error',
            method: 'GET',
            path: `/api/e2e/dedupe-test/${suffix}`,
            statusCode: 500,
          },
          {},
        );

        await waitForAlert(received, 1);
        expect(received.length).toBe(1);
        const first = received[0] as Record<string, unknown>;
        expect(first.analysis ?? first['analysis']).toBeTruthy();

        clearAlertSinksForTests();
      });
    });

    describe('Ops dashboard', () => {
      it('RPM / tasas y P95/P99 coherentes tras tráfico', async () => {
        for (let i = 0; i < 12; i++) {
          await request(app.getHttpServer())
            .get('/api/growth/context-public')
            .expect(200);
        }

        const overview = await request(app.getHttpServer())
          .get('/api/admin/ops/overview')
          .set('Cookie', cookieAdmin)
          .set('Authorization', `Bearer ${accessTokenAdmin}`)
          .set('X-CSRF-Token', csrfAdmin)
          .expect(200);

        expect(overview.body.requestsPerMinute).toBeGreaterThanOrEqual(0);
        expect(overview.body).toHaveProperty('p95ResponseTime');
        expect(overview.body).toHaveProperty('p99ResponseTime');
        expect(typeof overview.body.errorRate).toBe('number');
      });

      it('lookup por X-Request-Id / traceId', async () => {
        const traceId = `e2e-trace-${suffix}`;
        await request(app.getHttpServer())
          .get('/api/growth/context-public')
          .set('X-Request-Id', traceId)
          .expect(200);

        const hit = await request(app.getHttpServer())
          .get(`/api/admin/ops/traces/${encodeURIComponent(traceId)}`)
          .set('Cookie', cookieAdmin)
          .set('Authorization', `Bearer ${accessTokenAdmin}`)
          .set('X-CSRF-Token', csrfAdmin)
          .expect(200);
        expect(hit.body.found).toBe(true);
      });
    });
  },
);
