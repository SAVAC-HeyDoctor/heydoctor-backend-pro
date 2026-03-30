import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline schema for HeyDoctor (PostgreSQL).
 * Hand-authored from domain entities (fase 1.5); revisar tras cambios de modelo.
 */
export class InitialSchema1743298123456 implements MigrationInterface {
  name = 'InitialSchema1743298123456';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
    );

    await queryRunner.query(
      `CREATE TYPE "users_role_enum" AS ENUM ('doctor', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TYPE "consultations_status_enum" AS ENUM ('draft', 'in_progress', 'completed', 'signed', 'locked')`,
    );
    await queryRunner.query(
      `CREATE TYPE "audit_logs_status_enum" AS ENUM ('success', 'error')`,
    );
    await queryRunner.query(
      `CREATE TYPE "subscriptions_plan_enum" AS ENUM ('free', 'pro')`,
    );
    await queryRunner.query(
      `CREATE TYPE "subscriptions_status_enum" AS ENUM ('active', 'inactive')`,
    );
    await queryRunner.query(
      `CREATE TYPE "payku_payments_status_enum" AS ENUM ('pending', 'paid', 'failed', 'cancelled', 'expired')`,
    );
    await queryRunner.query(
      `CREATE TYPE "doctor_applications_status_enum" AS ENUM ('pending', 'approved', 'rejected')`,
    );
    await queryRunner.query(
      `CREATE TYPE "gdpr_deletion_requests_status_enum" AS ENUM ('pending', 'processing', 'completed', 'failed')`,
    );

    await queryRunner.query(`
      CREATE TABLE "clinics" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(200) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_23bcadae50f6ba0b0a70ae10239" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying NOT NULL,
        "password_hash" character varying NOT NULL,
        "role" "users_role_enum" NOT NULL DEFAULT 'doctor',
        "clinic_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"),
        CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"),
        CONSTRAINT "FK_a6027b1f6db1dab852e722efec6" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "telemedicine_consents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "clinic_id" uuid NOT NULL,
        "consent_given_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "ip" character varying(64),
        "user_agent" text,
        "version" character varying(32) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_6b73d8d2b43edc29b2a4e9e0b3c" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_3a6b79e0d1c4f8b2e9a1c2d3e4" ON "telemedicine_consents" ("user_id", "version")
    `);

    await queryRunner.query(`
      CREATE TABLE "patients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(200) NOT NULL,
        "email" character varying NOT NULL,
        "clinic_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_08f74160cfe5e62fdc66e07af9d" PRIMARY KEY ("id"),
        CONSTRAINT "FK_2e1fa36e04ef40e19c21b196389" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_patients_clinic_email" ON "patients" ("clinic_id", "email")
    `);

    await queryRunner.query(`
      CREATE TABLE "doctor_applications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(200) NOT NULL,
        "email" character varying(320) NOT NULL,
        "specialty" character varying(100) NOT NULL,
        "country" character varying(100) NOT NULL,
        "license_url" text,
        "status" "doctor_applications_status_enum" NOT NULL DEFAULT 'pending',
        "reviewed_by" uuid,
        "reviewed_at" TIMESTAMP WITH TIME ZONE,
        "rejection_reason" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_8b0b88b4b544c7f7e6d5c4b3a29" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_7c9f4f8e6d5c4b3a2918273645" ON "doctor_applications" ("email")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_6b5a4a392817163f4e5d3c2b1a" ON "doctor_applications" ("status")
    `);

    await queryRunner.query(`
      CREATE TABLE "subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "plan" "subscriptions_plan_enum" NOT NULL DEFAULT 'free',
        "status" "subscriptions_status_enum" NOT NULL DEFAULT 'active',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_a87248d71347810679cb8be6b8e" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_4fdd01d4e77ea3c4e3e9f8a7b6c" ON "subscriptions" ("user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "token_hash" character varying NOT NULL,
        "user_id" uuid NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "ip_address" character varying(64),
        "user_agent" text,
        "last_used_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_7d4c7b8a9e0f1d2c3b4a5e6f708" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_refresh_tokens_token_hash" ON "refresh_tokens" ("token_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid,
        "action" character varying(128) NOT NULL,
        "resource" character varying(64) NOT NULL,
        "resource_id" character varying(64),
        "clinic_id" uuid,
        "status" "audit_logs_status_enum" NOT NULL,
        "http_status" integer,
        "error_message" text,
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_1a29d7f121d5dfd917f68c6b3c1" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_clinic_created" ON "audit_logs" ("clinic_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_action_created" ON "audit_logs" ("action", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_clinic_action_created" ON "audit_logs" ("clinic_id", "action", "created_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "daily_metrics" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "date" date NOT NULL,
        "upgrades_total" integer NOT NULL DEFAULT 0,
        "upgrades_sales" integer NOT NULL DEFAULT 0,
        "upgrades_support" integer NOT NULL DEFAULT 0,
        "downgrades_refund" integer NOT NULL DEFAULT 0,
        "consultations_created" integer NOT NULL DEFAULT 0,
        "consultations_paid" integer NOT NULL DEFAULT 0,
        "consultations_started" integer NOT NULL DEFAULT 0,
        "consultations_completed" integer NOT NULL DEFAULT 0,
        "doctor_applications" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_daily_metrics" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_daily_metrics_date" ON "daily_metrics" ("date")
    `);

    await queryRunner.query(`
      CREATE TABLE "doctor_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "name" character varying(200) NOT NULL,
        "slug" character varying(200) NOT NULL,
        "specialty" character varying(100) NOT NULL,
        "country" character varying(100) NOT NULL DEFAULT '',
        "bio" text NOT NULL DEFAULT '',
        "avatar_url" text,
        "rating" numeric(3,2) NOT NULL DEFAULT 0,
        "rating_count" integer NOT NULL DEFAULT 0,
        "is_public" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_doctor_profiles_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_doctor_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "FK_doctor_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_doctor_profiles_user_id" ON "doctor_profiles" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_doctor_profiles_is_public" ON "doctor_profiles" ("is_public")
    `);

    await queryRunner.query(`
      CREATE TABLE "doctor_ratings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "doctor_profile_id" uuid NOT NULL,
        "consultation_id" uuid,
        "patient_name" character varying(200) NOT NULL,
        "rating" integer NOT NULL,
        "comment" text NOT NULL DEFAULT '',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_doctor_ratings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_doctor_ratings_profile" FOREIGN KEY ("doctor_profile_id") REFERENCES "doctor_profiles"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_doctor_ratings_profile" ON "doctor_ratings" ("doctor_profile_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "consultations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "patient_id" uuid NOT NULL,
        "clinic_id" uuid NOT NULL,
        "consent_id" uuid,
        "consent_version" character varying(32),
        "consent_given_at" TIMESTAMP WITH TIME ZONE,
        "consent_ip" character varying(64),
        "consent_user_agent" text,
        "doctor_signature" text,
        "patient_signature" text,
        "signed_at" TIMESTAMP WITH TIME ZONE,
        "doctor_id" uuid NOT NULL,
        "reason" text NOT NULL,
        "diagnosis" text,
        "treatment" text,
        "notes" text,
        "status" "consultations_status_enum" NOT NULL DEFAULT 'draft',
        "ai_summary" text,
        "ai_suggested_diagnosis" jsonb,
        "ai_improved_notes" text,
        "ai_generated_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_d7e5f8a1b2c3d4e5f60718293a4" PRIMARY KEY ("id"),
        CONSTRAINT "FK_consultations_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_consultations_clinic" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_consultations_consent" FOREIGN KEY ("consent_id") REFERENCES "telemedicine_consents"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_consultations_clinic_created" ON "consultations" ("clinic_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "payku_payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "consultation_id" uuid,
        "status" "payku_payments_status_enum" NOT NULL DEFAULT 'pending',
        "amount" integer NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'CLP',
        "transaction_id" character varying,
        "paid_at" TIMESTAMP WITH TIME ZONE,
        "raw_response" jsonb,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payku_payments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payku_user" ON "payku_payments" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payku_status" ON "payku_payments" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payku_consultation" ON "payku_payments" ("consultation_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "gdpr_deletion_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "status" "gdpr_deletion_requests_status_enum" NOT NULL DEFAULT 'pending',
        "confirmed_at" TIMESTAMP WITH TIME ZONE,
        "processed_at" TIMESTAMP WITH TIME ZONE,
        "anonymized_fields" jsonb,
        "error_detail" text,
        "ip_address" character varying(64),
        "user_agent" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_gdpr_deletion" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_gdpr_user" ON "gdpr_deletion_requests" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_gdpr_status" ON "gdpr_deletion_requests" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "gdpr_deletion_requests" CASCADE`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "payku_payments" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "consultations" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_ratings" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_profiles" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "daily_metrics" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscriptions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "doctor_applications" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "patients" CASCADE`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "telemedicine_consents" CASCADE`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "clinics" CASCADE`);

    await queryRunner.query(
      `DROP TYPE IF EXISTS "gdpr_deletion_requests_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "doctor_applications_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "payku_payments_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "subscriptions_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "subscriptions_plan_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "audit_logs_status_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "consultations_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
  }
}
