import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Clinic } from '../src/clinic/clinic.entity';
import {
  ApplicationStatus,
  DoctorApplication,
} from '../src/doctor-applications/doctor-application.entity';
import { DoctorProfile } from '../src/doctor-profiles/doctor-profile.entity';
import { UserRole } from '../src/users/user-role.enum';

/** Requiere Postgres: `DATABASE_E2E=1 npm run test:e2e`. */
const runIdorE2e = process.env.DATABASE_E2E === '1';

(runIdorE2e ? describe : describe.skip)('Security — multi-tenant IDOR (e2e)', () => {
  let app: INestApplication<App>;
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  let clinicAId: string;
  let clinicBId: string;
  let tokenDoctorA: string;
  let tokenDoctorB: string;
  let tokenAdminA: string;
  let patientBId: string;
  let consultationBId: string;
  let applicationBId: string;
  const doctorSlugB = `dr-e2e-b-${suffix}`;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL =
        'postgresql://postgres:postgres@127.0.0.1:5432/heydoctor_test';
    }
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = 'e2e-test-jwt-secret-min-32-chars!!';
    }
    process.env.PORT = process.env.PORT ?? '3999';

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

    const server = app.getHttpServer();
    const ds = app.get(DataSource);
    const clinicRepo = ds.getRepository(Clinic);
    const clinicA = await clinicRepo.save(
      clinicRepo.create({ name: `E2E Clinic A ${suffix}` }),
    );
    const clinicB = await clinicRepo.save(
      clinicRepo.create({ name: `E2E Clinic B ${suffix}` }),
    );
    clinicAId = clinicA.id;
    clinicBId = clinicB.id;

    const emailDocA = `doc_a_${suffix}@e2e.test`;
    const emailDocB = `doc_b_${suffix}@e2e.test`;
    const emailAdminA = `admin_a_${suffix}@e2e.test`;
    const password = 'Password123!';

    await request(server)
      .post('/api/auth/register')
      .send({
        email: emailDocA,
        password,
        clinicId: clinicAId,
        role: UserRole.DOCTOR,
      })
      .expect(201);

    await request(server)
      .post('/api/auth/register')
      .send({
        email: emailDocB,
        password,
        clinicId: clinicBId,
        role: UserRole.DOCTOR,
      })
      .expect(201);

    await request(server)
      .post('/api/auth/register')
      .send({
        email: emailAdminA,
        password,
        clinicId: clinicAId,
        role: UserRole.ADMIN,
      })
      .expect(201);

    const loginA = await request(server)
      .post('/api/auth/login')
      .send({ email: emailDocA, password })
      .expect(200);
    tokenDoctorA = loginA.body.access_token as string;

    const loginB = await request(server)
      .post('/api/auth/login')
      .send({ email: emailDocB, password })
      .expect(200);
    tokenDoctorB = loginB.body.access_token as string;

    const loginAdminA = await request(server)
      .post('/api/auth/login')
      .send({ email: emailAdminA, password })
      .expect(200);
    tokenAdminA = loginAdminA.body.access_token as string;

    await request(server)
      .post('/api/consents/telemedicine')
      .set('Authorization', `Bearer ${tokenDoctorB}`)
      .expect(201);

    const patientRes = await request(server)
      .post('/api/patients')
      .set('Authorization', `Bearer ${tokenDoctorB}`)
      .send({
        name: 'Patient B',
        email: `patient_b_${suffix}@e2e.test`,
      })
      .expect(201);
    patientBId = patientRes.body.id as string;

    const consRes = await request(server)
      .post('/api/consultations')
      .set('Authorization', `Bearer ${tokenDoctorB}`)
      .send({
        patientId: patientBId,
        reason: 'E2E IDOR cross-clinic consultation in clinic B',
      })
      .expect(201);
    consultationBId = consRes.body.id as string;

    const userBId = (await ds.query(
      `SELECT id FROM users WHERE email = $1`,
      [emailDocB],
    )) as { id: string }[];
    const docBUserId = userBId[0].id;

    const profileRepo = ds.getRepository(DoctorProfile);
    await profileRepo.save(
      profileRepo.create({
        userId: docBUserId,
        clinicId: clinicBId,
        name: 'Doctor B E2E',
        slug: doctorSlugB,
        specialty: 'general',
        country: 'CL',
        isPublic: true,
      }),
    );

    const appRepo = ds.getRepository(DoctorApplication);
    const appRow = await appRepo.save(
      appRepo.create({
        clinicId: clinicBId,
        name: 'Applicant',
        email: `applicant_${suffix}@e2e.test`,
        specialty: 'cardio',
        country: 'CL',
        status: ApplicationStatus.PENDING,
        licenseUrl: null,
      }),
    );
    applicationBId = appRow.id;
  }, 120_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('doctor A cannot create a consultation for patient in clinic B', async () => {
    await request(app.getHttpServer())
      .post('/api/consultations')
      .set('Authorization', `Bearer ${tokenDoctorA}`)
      .send({
        patientId: patientBId,
        reason: 'cross-tenant attempt',
      })
      .expect(403);
  });

  it('doctor A cannot read consultation from clinic B', async () => {
    await request(app.getHttpServer())
      .get(`/api/consultations/${consultationBId}`)
      .set('Authorization', `Bearer ${tokenDoctorA}`)
      .expect(404);
  });

  it('doctor A cannot POST rating tied to consultation in clinic B', async () => {
    await request(app.getHttpServer())
      .post(`/api/doctors/${doctorSlugB}/ratings`)
      .set('Authorization', `Bearer ${tokenDoctorA}`)
      .send({
        patientName: 'X',
        rating: 5,
        consultationId: consultationBId,
      })
      .expect(403);
  });

  it('admin in clinic A cannot read doctor application from clinic B', async () => {
    await request(app.getHttpServer())
      .get(`/api/doctor-applications/${applicationBId}`)
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .expect(404);
  });
});
