import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-tenant: clinic_id NOT NULL + FK a clinics (ON DELETE RESTRICT) en tablas de negocio.
 *
 * Backfill desde relaciones existentes (users, doctor_profiles, consultations) donde aplique;
 * filas huérfanas usan la clínica más antigua (created_at ASC).
 *
 * consultations / appointments: se reemplaza FK de clínica ON DELETE CASCADE → RESTRICT.
 *
 * daily_metrics: de métrica global por fecha a una fila por (clinic_id, date).
 */
export class MultiTenantClinicIdCoreEntities1746300000000
  implements MigrationInterface
{
  name = 'MultiTenantClinicIdCoreEntities1746300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const defaultClinic = await queryRunner.query(`
      SELECT id FROM clinics ORDER BY created_at ASC LIMIT 1
    `);
    if (!defaultClinic?.length) {
      throw new Error(
        'MultiTenantClinicId: no hay filas en clinics; crear al menos una clínica antes.',
      );
    }
    const defaultClinicId: string = defaultClinic[0].id;

    // ── doctor_profiles ─────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE doctor_profiles
      ADD COLUMN IF NOT EXISTS clinic_id uuid
    `);
    await queryRunner.query(`
      UPDATE doctor_profiles dp
      SET clinic_id = u.clinic_id
      FROM users u
      WHERE dp.user_id = u.id AND dp.clinic_id IS NULL
    `);
    await queryRunner.query(`
      UPDATE doctor_profiles SET clinic_id = $1 WHERE clinic_id IS NULL
    `, [defaultClinicId]);
    await queryRunner.query(`
      ALTER TABLE doctor_profiles ALTER COLUMN clinic_id SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE doctor_profiles
      DROP CONSTRAINT IF EXISTS "FK_doctor_profiles_clinic"
    `);
    await queryRunner.query(`
      ALTER TABLE doctor_profiles
      ADD CONSTRAINT "FK_doctor_profiles_clinic"
      FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_doctor_profiles_clinic_id"
      ON doctor_profiles ("clinic_id")
    `);

    // ── doctor_ratings ──────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE doctor_ratings
      ADD COLUMN IF NOT EXISTS clinic_id uuid
    `);
    await queryRunner.query(`
      UPDATE doctor_ratings dr
      SET clinic_id = dp.clinic_id
      FROM doctor_profiles dp
      WHERE dr.doctor_profile_id = dp.id AND dr.clinic_id IS NULL
    `);
    await queryRunner.query(`
      UPDATE doctor_ratings SET clinic_id = $1 WHERE clinic_id IS NULL
    `, [defaultClinicId]);
    await queryRunner.query(`
      ALTER TABLE doctor_ratings ALTER COLUMN clinic_id SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE doctor_ratings
      DROP CONSTRAINT IF EXISTS "FK_doctor_ratings_clinic"
    `);
    await queryRunner.query(`
      ALTER TABLE doctor_ratings
      ADD CONSTRAINT "FK_doctor_ratings_clinic"
      FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_doctor_ratings_clinic_id"
      ON doctor_ratings ("clinic_id")
    `);

    // ── subscriptions ───────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE subscriptions
      ADD COLUMN IF NOT EXISTS clinic_id uuid
    `);
    await queryRunner.query(`
      UPDATE subscriptions s
      SET clinic_id = u.clinic_id
      FROM users u
      WHERE s.user_id = u.id AND s.clinic_id IS NULL
    `);
    await queryRunner.query(`
      UPDATE subscriptions SET clinic_id = $1 WHERE clinic_id IS NULL
    `, [defaultClinicId]);
    await queryRunner.query(`
      ALTER TABLE subscriptions ALTER COLUMN clinic_id SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE subscriptions
      DROP CONSTRAINT IF EXISTS "FK_subscriptions_clinic"
    `);
    await queryRunner.query(`
      ALTER TABLE subscriptions
      ADD CONSTRAINT "FK_subscriptions_clinic"
      FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_subscriptions_clinic_id"
      ON subscriptions ("clinic_id")
    `);

    // ── payku_payments ──────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE payku_payments
      ADD COLUMN IF NOT EXISTS clinic_id uuid
    `);
    await queryRunner.query(`
      UPDATE payku_payments p
      SET clinic_id = sub.cid
      FROM (
        SELECT
          p2.id,
          COALESCE(c.clinic_id, u.clinic_id) AS cid
        FROM payku_payments p2
        INNER JOIN users u ON u.id = p2.user_id
        LEFT JOIN consultations c ON c.id = p2.consultation_id
      ) sub
      WHERE p.id = sub.id AND sub.cid IS NOT NULL AND p.clinic_id IS NULL
    `);
    await queryRunner.query(`
      UPDATE payku_payments SET clinic_id = $1 WHERE clinic_id IS NULL
    `, [defaultClinicId]);
    await queryRunner.query(`
      ALTER TABLE payku_payments ALTER COLUMN clinic_id SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE payku_payments
      DROP CONSTRAINT IF EXISTS "FK_payku_payments_clinic"
    `);
    await queryRunner.query(`
      ALTER TABLE payku_payments
      ADD CONSTRAINT "FK_payku_payments_clinic"
      FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_payku_clinic_id"
      ON payku_payments ("clinic_id")
    `);

    // ── doctor_applications (sin FK previa a clínica) ───────────
    await queryRunner.query(`
      ALTER TABLE doctor_applications
      ADD COLUMN IF NOT EXISTS clinic_id uuid
    `);
    await queryRunner.query(`
      UPDATE doctor_applications SET clinic_id = $1 WHERE clinic_id IS NULL
    `, [defaultClinicId]);
    await queryRunner.query(`
      ALTER TABLE doctor_applications ALTER COLUMN clinic_id SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE doctor_applications
      DROP CONSTRAINT IF EXISTS "FK_doctor_applications_clinic"
    `);
    await queryRunner.query(`
      ALTER TABLE doctor_applications
      ADD CONSTRAINT "FK_doctor_applications_clinic"
      FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_doctor_applications_clinic_id"
      ON doctor_applications ("clinic_id")
    `);

    // ── audit_logs ─────────────────────────────────────────────
    await queryRunner.query(`
      UPDATE audit_logs al
      SET clinic_id = u.clinic_id
      FROM users u
      WHERE al.user_id = u.id AND al.clinic_id IS NULL
    `);
    await queryRunner.query(`
      UPDATE audit_logs SET clinic_id = $1 WHERE clinic_id IS NULL
    `, [defaultClinicId]);
    await queryRunner.query(`
      ALTER TABLE audit_logs ALTER COLUMN clinic_id SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE audit_logs
      DROP CONSTRAINT IF EXISTS "FK_audit_logs_clinic"
    `);
    await queryRunner.query(`
      ALTER TABLE audit_logs
      ADD CONSTRAINT "FK_audit_logs_clinic"
      FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT
    `);

    // ── gdpr_deletion_requests ─────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE gdpr_deletion_requests
      ADD COLUMN IF NOT EXISTS clinic_id uuid
    `);
    await queryRunner.query(`
      UPDATE gdpr_deletion_requests g
      SET clinic_id = u.clinic_id
      FROM users u
      WHERE g.user_id = u.id AND g.clinic_id IS NULL
    `);
    await queryRunner.query(`
      UPDATE gdpr_deletion_requests SET clinic_id = $1 WHERE clinic_id IS NULL
    `, [defaultClinicId]);
    await queryRunner.query(`
      ALTER TABLE gdpr_deletion_requests ALTER COLUMN clinic_id SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE gdpr_deletion_requests
      DROP CONSTRAINT IF EXISTS "FK_gdpr_deletion_clinic"
    `);
    await queryRunner.query(`
      ALTER TABLE gdpr_deletion_requests
      ADD CONSTRAINT "FK_gdpr_deletion_clinic"
      FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_gdpr_clinic_id"
      ON gdpr_deletion_requests ("clinic_id")
    `);

    // ── refresh_tokens ─────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE refresh_tokens
      ADD COLUMN IF NOT EXISTS clinic_id uuid
    `);
    await queryRunner.query(`
      UPDATE refresh_tokens r
      SET clinic_id = u.clinic_id
      FROM users u
      WHERE r.user_id = u.id AND r.clinic_id IS NULL
    `);
    await queryRunner.query(`
      UPDATE refresh_tokens SET clinic_id = $1 WHERE clinic_id IS NULL
    `, [defaultClinicId]);
    await queryRunner.query(`
      ALTER TABLE refresh_tokens ALTER COLUMN clinic_id SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE refresh_tokens
      DROP CONSTRAINT IF EXISTS "FK_refresh_tokens_clinic"
    `);
    await queryRunner.query(`
      ALTER TABLE refresh_tokens
      ADD CONSTRAINT "FK_refresh_tokens_clinic"
      FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_clinic_id"
      ON refresh_tokens ("clinic_id")
    `);

    // ── telemedicine_consents (columna ya existía) ─────────────
    await queryRunner.query(`
      ALTER TABLE telemedicine_consents
      DROP CONSTRAINT IF EXISTS "FK_telemedicine_consents_clinic"
    `);
    await queryRunner.query(`
      ALTER TABLE telemedicine_consents
      ADD CONSTRAINT "FK_telemedicine_consents_clinic"
      FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT
    `);

    // ── daily_metrics: (clinic_id, date) único ─────────────────
    await queryRunner.query(`
      ALTER TABLE daily_metrics
      ADD COLUMN IF NOT EXISTS clinic_id uuid
    `);
    await queryRunner.query(`
      UPDATE daily_metrics SET clinic_id = $1 WHERE clinic_id IS NULL
    `, [defaultClinicId]);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_daily_metrics_date"
    `);
    await queryRunner.query(`
      ALTER TABLE daily_metrics ALTER COLUMN clinic_id SET NOT NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_daily_metrics_clinic_date"
      ON daily_metrics ("clinic_id", "date")
    `);
    await queryRunner.query(`
      ALTER TABLE daily_metrics
      DROP CONSTRAINT IF EXISTS "FK_daily_metrics_clinic"
    `);
    await queryRunner.query(`
      ALTER TABLE daily_metrics
      ADD CONSTRAINT "FK_daily_metrics_clinic"
      FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT
    `);

    // ── consultations / appointments: FK clínica RESTRICT ─────
    await queryRunner.query(`
      ALTER TABLE consultations
      DROP CONSTRAINT IF EXISTS "FK_consultations_clinic"
    `);
    await queryRunner.query(`
      ALTER TABLE consultations
      ADD CONSTRAINT "FK_consultations_clinic"
      FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE appointments
      DROP CONSTRAINT IF EXISTS "FK_appointments_clinic"
    `);
    await queryRunner.query(`
      ALTER TABLE appointments
      ADD CONSTRAINT "FK_appointments_clinic"
      FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE appointments
      DROP CONSTRAINT IF EXISTS "FK_appointments_clinic"
    `);
    await queryRunner.query(`
      ALTER TABLE appointments
      ADD CONSTRAINT "FK_appointments_clinic"
      FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE consultations
      DROP CONSTRAINT IF EXISTS "FK_consultations_clinic"
    `);
    await queryRunner.query(`
      ALTER TABLE consultations
      ADD CONSTRAINT "FK_consultations_clinic"
      FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE telemedicine_consents
      DROP CONSTRAINT IF EXISTS "FK_telemedicine_consents_clinic"
    `);

    await queryRunner.query(`
      ALTER TABLE daily_metrics DROP CONSTRAINT IF EXISTS "FK_daily_metrics_clinic"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_daily_metrics_clinic_date"
    `);
    await queryRunner.query(`
      DELETE FROM daily_metrics
    `);
    await queryRunner.query(`
      ALTER TABLE daily_metrics DROP COLUMN IF EXISTS clinic_id
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_daily_metrics_date"
      ON daily_metrics ("date")
    `);

    await queryRunner.query(`
      ALTER TABLE refresh_tokens
      DROP CONSTRAINT IF EXISTS "FK_refresh_tokens_clinic"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_refresh_tokens_clinic_id"
    `);
    await queryRunner.query(`
      ALTER TABLE refresh_tokens DROP COLUMN IF EXISTS clinic_id
    `);

    await queryRunner.query(`
      ALTER TABLE gdpr_deletion_requests
      DROP CONSTRAINT IF EXISTS "FK_gdpr_deletion_clinic"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_gdpr_clinic_id"
    `);
    await queryRunner.query(`
      ALTER TABLE gdpr_deletion_requests DROP COLUMN IF EXISTS clinic_id
    `);

    await queryRunner.query(`
      ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS "FK_audit_logs_clinic"
    `);
    await queryRunner.query(`
      ALTER TABLE audit_logs ALTER COLUMN clinic_id DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE doctor_applications
      DROP CONSTRAINT IF EXISTS "FK_doctor_applications_clinic"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_doctor_applications_clinic_id"
    `);
    await queryRunner.query(`
      ALTER TABLE doctor_applications DROP COLUMN IF EXISTS clinic_id
    `);

    await queryRunner.query(`
      ALTER TABLE payku_payments DROP CONSTRAINT IF EXISTS "FK_payku_payments_clinic"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_payku_clinic_id"
    `);
    await queryRunner.query(`
      ALTER TABLE payku_payments DROP COLUMN IF EXISTS clinic_id
    `);

    await queryRunner.query(`
      ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS "FK_subscriptions_clinic"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_subscriptions_clinic_id"
    `);
    await queryRunner.query(`
      ALTER TABLE subscriptions DROP COLUMN IF EXISTS clinic_id
    `);

    await queryRunner.query(`
      ALTER TABLE doctor_ratings DROP CONSTRAINT IF EXISTS "FK_doctor_ratings_clinic"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_doctor_ratings_clinic_id"
    `);
    await queryRunner.query(`
      ALTER TABLE doctor_ratings DROP COLUMN IF EXISTS clinic_id
    `);

    await queryRunner.query(`
      ALTER TABLE doctor_profiles DROP CONSTRAINT IF EXISTS "FK_doctor_profiles_clinic"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_doctor_profiles_clinic_id"
    `);
    await queryRunner.query(`
      ALTER TABLE doctor_profiles DROP COLUMN IF EXISTS clinic_id
    `);
  }
}
