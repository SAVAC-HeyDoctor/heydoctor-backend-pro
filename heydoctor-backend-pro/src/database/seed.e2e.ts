import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import type { DataSource } from 'typeorm';
import { assignClinic } from '../common/entity-clinic.util';
import {
  TELEMEDICINE_CONSENT_VERSION,
  TelemedicineConsent,
} from '../consents/consent.entity';
import { ConsultationStatus } from '../consultations/consultation-status.enum';
import { Consultation } from '../consultations/consultation.entity';
import { Clinic } from '../clinic/clinic.entity';
import {
  SubscriptionPlan,
  SubscriptionStatus,
} from '../subscriptions/subscription.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { Patient } from '../patients/patient.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import {
  E2E_CI_ADMIN_EMAIL,
  E2E_CI_DOCTOR_EMAIL,
  E2E_CI_PASSWORD,
  E2E_CI_SEED_CLINIC_NAME,
  E2E_CONSULT_MARKER_FAIL,
  E2E_CONSULT_MARKER_PAY,
} from './e2e-ci-seed.constants';
import AppDataSource from '../data-source';

export type E2ESeedSnapshot = {
  clinicId: string;
  adminId: string;
  doctorId: string;
  patientId: string;
  consentId: string;
  consultationPaidReadyId: string;
  consultationFailedReadyId: string;
};

const BCRYPT_SEED_ROUNDS = 10;

/**
 * Upsert idempotente: clínica, admin, doctor PRO, paciente y consultas pagables para E2E.
 * Ejecutable vía CLI: `node dist/database/seed.e2e.js` (tras build + DATABASE_URL).
 */
export async function seedE2E(
  dataSource: DataSource,
): Promise<E2ESeedSnapshot> {
  const clinicRepo = dataSource.getRepository(Clinic);
  const userRepo = dataSource.getRepository(User);
  const subRepo = dataSource.getRepository(Subscription);
  const consentRepo = dataSource.getRepository(TelemedicineConsent);
  const patientRepo = dataSource.getRepository(Patient);
  const consultRepo = dataSource.getRepository(Consultation);

  let clinic =
    (await clinicRepo.findOne({ where: { name: E2E_CI_SEED_CLINIC_NAME } })) ??
    null;
  if (!clinic) {
    clinic = await clinicRepo.save(
      clinicRepo.create({ name: E2E_CI_SEED_CLINIC_NAME }),
    );
  }

  const passHash = await bcrypt.hash(E2E_CI_PASSWORD, BCRYPT_SEED_ROUNDS);

  let admin =
    (await userRepo.findOne({
      where: {
        email: E2E_CI_ADMIN_EMAIL,
        clinicId: clinic.id,
      },
    })) ?? null;

  let doctor =
    (await userRepo.findOne({
      where: {
        email: E2E_CI_DOCTOR_EMAIL,
        clinicId: clinic.id,
      },
    })) ?? null;

  if (!admin) {
    const entity = userRepo.create({
      email: E2E_CI_ADMIN_EMAIL,
      passwordHash: passHash,
      role: UserRole.ADMIN,
      name: null,
      isActive: true,
    });
    assignClinic(entity, clinic.id);
    admin = await userRepo.save(entity);
  } else if (admin.isActive !== true) {
    admin.isActive = true;
    await userRepo.save(admin);
  }

  if (!doctor) {
    const entity = userRepo.create({
      email: E2E_CI_DOCTOR_EMAIL,
      passwordHash: passHash,
      role: UserRole.DOCTOR,
      name: null,
      isActive: true,
    });
    assignClinic(entity, clinic.id);
    doctor = await userRepo.save(entity);
  } else if (doctor.isActive !== true) {
    doctor.isActive = true;
    await userRepo.save(doctor);
  }

  let sub = await subRepo.findOne({ where: { userId: doctor.id } });
  if (!sub) {
    sub = subRepo.create({
      userId: doctor.id,
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      price: '0',
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });
    assignClinic(sub, clinic.id);
    await subRepo.save(sub);
  } else {
    sub.plan = SubscriptionPlan.PRO;
    sub.status = SubscriptionStatus.ACTIVE;
    if (!sub.clinicId) assignClinic(sub, clinic.id);
    await subRepo.save(sub);
  }

  let adminSub = await subRepo.findOne({ where: { userId: admin.id } });
  if (!adminSub) {
    adminSub = subRepo.create({
      userId: admin.id,
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.ACTIVE,
      price: '0',
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });
    assignClinic(adminSub, clinic.id);
    await subRepo.save(adminSub);
  }

  let consent =
    (await consentRepo.findOne({
      where: {
        userId: doctor.id,
        version: TELEMEDICINE_CONSENT_VERSION,
      },
    })) ?? null;
  const now = new Date();
  if (!consent) {
    consent = consentRepo.create({
      userId: doctor.id,
      consentGivenAt: now,
      version: TELEMEDICINE_CONSENT_VERSION,
      ip: '127.0.0.1',
      userAgent: 'ci-seed-e2e',
    });
    assignClinic(consent, clinic.id);
    consent = await consentRepo.save(consent);
  }

  let patient =
    (await patientRepo.findOne({
      where: {
        clinicId: clinic.id,
        email: 'e2e.ci.patient@heydoctor.local',
      },
    })) ?? null;
  if (!patient) {
    const pEntity = patientRepo.create({
      name: 'E2E Paciente Seed',
      email: 'e2e.ci.patient@heydoctor.local',
    });
    assignClinic(pEntity, clinic.id);
    patient = await patientRepo.save(pEntity);
  }

  let consPay =
    (await consultRepo.findOne({
      where: {
        doctorId: doctor.id,
        reason: E2E_CONSULT_MARKER_PAY,
        clinicId: clinic.id,
      },
    })) ?? null;
  if (!consPay) {
    consPay = consultRepo.create({
      patient: { id: patient.id },
      clinicId: clinic.id,
      consent: { id: consent.id },
      consentVersion: consent.version,
      consentGivenAt: consent.consentGivenAt,
      consentIp: consent.ip,
      consentUserAgent: consent.userAgent,
      doctorId: doctor.id,
      reason: E2E_CONSULT_MARKER_PAY,
      status: ConsultationStatus.COMPLETED,
    });
    assignClinic(consPay, clinic.id);
    consPay = await consultRepo.save(consPay);
  } else if (consPay.status !== ConsultationStatus.COMPLETED) {
    consPay.status = ConsultationStatus.COMPLETED;
    await consultRepo.save(consPay);
  }

  let consFail =
    (await consultRepo.findOne({
      where: {
        doctorId: doctor.id,
        reason: E2E_CONSULT_MARKER_FAIL,
        clinicId: clinic.id,
      },
    })) ?? null;
  if (!consFail) {
    consFail = consultRepo.create({
      patient: { id: patient.id },
      clinicId: clinic.id,
      consent: { id: consent.id },
      consentVersion: consent.version,
      consentGivenAt: consent.consentGivenAt,
      consentIp: consent.ip,
      consentUserAgent: consent.userAgent,
      doctorId: doctor.id,
      reason: E2E_CONSULT_MARKER_FAIL,
      status: ConsultationStatus.COMPLETED,
    });
    assignClinic(consFail, clinic.id);
    consFail = await consultRepo.save(consFail);
  } else if (consFail.status !== ConsultationStatus.COMPLETED) {
    consFail.status = ConsultationStatus.COMPLETED;
    await consultRepo.save(consFail);
  }

  await dataSource.query(
    `DELETE FROM payku_payments WHERE consultation_id IN ($1, $2)`,
    [consPay.id, consFail.id],
  );

  return {
    clinicId: clinic.id,
    adminId: admin.id,
    doctorId: doctor.id,
    patientId: patient.id,
    consentId: consent.id,
    consultationPaidReadyId: consPay.id,
    consultationFailedReadyId: consFail.id,
  };
}

function invokedAsNodeCli(): boolean {
  const argv1 = process.argv[1]?.replace(/\\/g, '/') ?? '';
  return argv1.includes('/database/seed.e2e') || argv1.endsWith('seed.e2e.js');
}

if (invokedAsNodeCli()) {
  void (async () => {
    await AppDataSource.initialize();
    try {
      await seedE2E(AppDataSource);
      console.log('[seed:e2e] OK');
    } finally {
      await AppDataSource.destroy().catch(() => undefined);
    }
  })().catch((e: unknown) => {
    console.error('[seed:e2e] FAILED', e);
    process.exit(1);
  });
}
