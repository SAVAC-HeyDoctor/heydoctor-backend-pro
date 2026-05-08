import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAppointments1746100000000 implements MigrationInterface {
  name = 'CreateAppointments1746100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
DO $$ BEGIN CREATE TYPE "appointments_status_enum" AS ENUM ('pending', 'confirmed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "appointments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "clinic_id" uuid NOT NULL,
        "patient_id" uuid NOT NULL,
        "doctor_id" uuid NOT NULL,
        "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "status" "appointments_status_enum" NOT NULL DEFAULT 'pending',
        "confirmation_token" uuid,
        "confirmation_token_expires_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_appointments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_appointments_clinic" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_appointments_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_appointments_doctor" FOREIGN KEY ("doctor_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_appointments_confirmation_token"
      ON "appointments" ("confirmation_token")
      WHERE "confirmation_token" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_appointments_clinic_starts_at"
      ON "appointments" ("clinic_id", "starts_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "appointments"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "appointments_status_enum"`);
  }
}
