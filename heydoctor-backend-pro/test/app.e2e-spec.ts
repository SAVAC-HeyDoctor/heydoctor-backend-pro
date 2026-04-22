import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/** Activa smoke e2e con Postgres disponible: `DATABASE_E2E=1 npm run test:e2e`. */
const runDbE2e = process.env.DATABASE_E2E === '1';

(runDbE2e ? describe : describe.skip)('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL =
        'postgresql://postgres:postgres@127.0.0.1:5432/heydoctor_test';
    }
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'e2e-test-jwt-secret-min-32-chars!!';
    }
    process.env.PORT = process.env.PORT ?? '3999';
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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
  }, 120_000);

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Content-Type', /text\/plain/)
      .expect('ok');
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect('Content-Type', /text\/plain/)
      .expect('ok');
  });

  /** `/_health` solo existe en `main.ts` (Express); la app de test no monta ese handler. */

  it('/healthz (GET)', () => {
    return request(app.getHttpServer())
      .get('/healthz')
      .expect(200)
      .expect('Content-Type', /text\/plain/)
      .expect('ok');
  });
});
