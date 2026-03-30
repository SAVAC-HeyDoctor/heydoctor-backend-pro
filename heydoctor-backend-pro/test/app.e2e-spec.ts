import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(() => {
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL =
        'postgresql://postgres:postgres@127.0.0.1:5432/heydoctor_test';
    }
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'e2e-test-jwt-secret-min-32-chars!!';
    }
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
        { path: '_health', method: RequestMethod.GET },
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
  });

  afterEach(async () => {
    await app.close();
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

  it('/_health (GET)', () => {
    return request(app.getHttpServer())
      .get('/_health')
      .expect(200)
      .expect('Content-Type', /text\/plain/)
      .expect('ok');
  });

  it('/healthz (GET)', () => {
    return request(app.getHttpServer())
      .get('/healthz')
      .expect(200)
      .expect('Content-Type', /text\/plain/)
      .expect('ok');
  });
});
