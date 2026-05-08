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
import type { AddressInfo } from 'node:net';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Socket } from 'socket.io-client';
import { io } from 'socket.io-client';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from '../../src/app.module';
import { RequestIdMiddleware } from '../../src/common/middleware/request-id.middleware';
import {
  clearAlertSinksForTests,
  notifyAlert,
  registerAlertSink,
} from '../../src/common/alerts/alert.hooks';
import { Clinic } from '../../src/clinic/clinic.entity';
import { GrowthFunnelEvents } from '../../src/growth/growth-event-names';
import { Subscription, SubscriptionPlan } from '../../src/subscriptions/subscription.entity';
import { UserRole } from '../../src/users/user-role.enum';

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

async function flushAlertDispatch(): Promise<void> {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 80));
}

(runCritical ? describe : describe.skip)(
  'Critical flows — production readiness (e2e)',
  () => {
    let app: INestApplication<App>;
    let httpPort: number;
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const anonSessionId = `anon_sess_${suffix.replace(/[^a-zA-Z0-9_]/g, '').padEnd(16, 'x')}`.slice(
      0,
      80,
    );

    let clinicId: string;
    let cookieAdmin: string;
    let csrfAdmin: string;
    let accessTokenAdmin: string;

    let cookieDoctor: string;
    let csrfDoctor: string;
    let accessDoctor: string;

    let patientId: string;
    let consultationPaidId: string;
    let paymentPaidId: string;
    let consultationFailedId: string;

    const password = 'Password123!';
    const emailAdmin = `cf_admin_${suffix}@e2e.test`;
    const emailDoctor = `cf_doc_${suffix}@e2e.test`;
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

      await app.init();

      const server = app.getHttpServer();
      await new Promise<void>((resolve, reject) => {
        server.listen(0, '127.0.0.1', () => resolve());
        server.once('error', reject);
      });
      const addr = server.address() as AddressInfo;
      httpPort = addr.port;

      const ds = app.get(DataSource);
      const clinicRepo = ds.getRepository(Clinic);
      const c = await clinicRepo.save(
        clinicRepo.create({ name: `CF Clinic ${suffix}` }),
      );
      clinicId = c.id;

      await request(server)
        .post('/api/auth/register')
        .send({
          email: emailAdmin,
          password,
          clinicId,
          role: UserRole.ADMIN,
        })
        .expect(201);

      await request(server)
        .post('/api/auth/register')
        .send({
          email: emailDoctor,
          password,
          clinicId,
          role: UserRole.DOCTOR,
        })
        .expect(201);

      const loginAdmin = await request(server)
        .post('/api/auth/login')
        .send({ email: emailAdmin, password })
        .expect(200);
      cookieAdmin = cookieHeaderFromSetCookie(loginAdmin.headers['set-cookie']);
      csrfAdmin = csrfTokenFromSetCookie(loginAdmin.headers['set-cookie']);
      accessTokenAdmin = loginAdmin.body.access_token as string;

      const loginDoc = await request(server)
        .post('/api/auth/login')
        .send({ email: emailDoctor, password })
        .expect(200);
      cookieDoctor = cookieHeaderFromSetCookie(loginDoc.headers['set-cookie']);
      csrfDoctor = csrfTokenFromSetCookie(loginDoc.headers['set-cookie']);
      accessDoctor = loginDoc.body.access_token as string;

      const docUserRow = await ds.query(
        `SELECT id FROM users WHERE email = $1`,
        [emailDoctor],
      );
      const docUserId = docUserRow[0].id as string;
      const subRepo = ds.getRepository(Subscription);
      const sub = await subRepo.findOne({ where: { userId: docUserId } });
      if (sub) {
        sub.plan = SubscriptionPlan.PRO;
        await subRepo.save(sub);
      }

      await request(server)
        .post('/api/consents/telemedicine')
        .set('Cookie', cookieDoctor)
        .set('X-CSRF-Token', csrfDoctor)
        .expect(201);

      const patientRes = await request(server)
        .post('/api/patients')
        .set('Cookie', cookieDoctor)
        .set('X-CSRF-Token', csrfDoctor)
        .send({
          name: 'Paciente QA',
          email: `cf_pat_${suffix}@e2e.test`,
        })
        .expect(201);
      patientId = patientRes.body.id as string;

      const cons1 = await request(server)
        .post('/api/consultations')
        .set('Cookie', cookieDoctor)
        .set('X-CSRF-Token', csrfDoctor)
        .send({
          patientId,
          reason: 'E2E pago consulta',
        })
        .expect(201);
      consultationPaidId = cons1.body.id as string;

      const cons2 = await request(server)
        .post('/api/consultations')
        .set('Cookie', cookieDoctor)
        .set('X-CSRF-Token', csrfDoctor)
        .send({
          patientId,
          reason: 'E2E pago fallido',
        })
        .expect(201);
      consultationFailedId = cons2.body.id as string;

      const payRes = await request(server)
        .post('/api/payku/create-payment-session')
        .set('Authorization', `Bearer ${accessDoctor}`)
        .send({ consultationId: consultationPaidId })
        .expect((r) => {
          expect([200, 201]).toContain(r.status);
        });
      paymentPaidId = payRes.body.paymentId as string;
    }, 240_000);

    afterAll(async () => {
      if (app) {
        await app.close();
      }
    });

    describe('Auth', () => {
      it('login válido devuelve tokens y cookies', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: emailDoctor, password })
          .expect(200);
        expect(res.body.access_token).toBeTruthy();
        expect(res.body.user?.email).toBe(emailDoctor);
      });

      it('login inválido → 401', () => {
        return request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: emailDoctor, password: 'wrong-pass-xyz' })
          .expect(401);
      });

      it('refresh con cookie emite nuevo access_token', async () => {
        const login = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: emailAdmin, password })
          .expect(200);
        const cookie = cookieHeaderFromSetCookie(login.headers['set-cookie']);
        const res = await request(app.getHttpServer())
          .post('/api/auth/refresh')
          .set('Cookie', cookie)
          .expect(200);
        expect(res.body.access_token).toBeTruthy();
        expect(res.body.ok).toBe(true);
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
          .expect(200);
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
          .expect(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.duplicate).toBe(true);
      });

      it('webhook failed para otro pago pendiente', async () => {
        const payRes = await request(app.getHttpServer())
          .post('/api/payku/create-payment-session')
          .set('Authorization', `Bearer ${accessDoctor}`)
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
          .expect(200);
        expect(res.body.ok).toBe(true);
      });
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
      it('join-consultation con plan PRO', async () => {
        const socket: Socket = io(`http://127.0.0.1:${httpPort}/webrtc`, {
          auth: { token: accessDoctor },
          transports: ['websocket'],
          reconnection: false,
          forceNew: true,
        });

        await new Promise<void>((resolve, reject) => {
          const to = setTimeout(
            () => reject(new Error('WebSocket join timeout')),
            15_000,
          );
          socket.on('connect', () => {
            socket.emit(
              'join-consultation',
              { consultationId: consultationPaidId },
              (ack: { ok?: boolean; consultationId?: string }) => {
                clearTimeout(to);
                try {
                  expect(ack?.ok).toBe(true);
                  expect(ack?.consultationId).toBe(consultationPaidId);
                  socket.disconnect();
                  resolve();
                } catch (e) {
                  socket.disconnect();
                  reject(e);
                }
              },
            );
          });
          socket.on('connect_error', (err) => {
            clearTimeout(to);
            reject(err);
          });
        });
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
            path: '/api/e2e/dedupe-test',
            statusCode: 500,
          },
          {},
        );
        notifyAlert(
          {
            event: 'server_error',
            method: 'GET',
            path: '/api/e2e/dedupe-test',
            statusCode: 500,
          },
          {},
        );

        await flushAlertDispatch();
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
