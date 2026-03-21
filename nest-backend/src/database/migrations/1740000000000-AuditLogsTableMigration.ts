import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditLogsTableMigration1740000000000 implements MigrationInterface {
  name = 'AuditLogsTableMigration1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('audit_logs');
    if (exists) return;

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "action" character varying(64) NOT NULL,
        "resourceType" character varying(32) NOT NULL,
        "resourceId" uuid,
        "patientId" uuid,
        "userId" uuid NOT NULL,
        "clinicId" uuid,
        "httpMethod" character varying(16),
        "path" character varying(512),
        "metadata" jsonb,
        "ipAddress" character varying(128),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_user_created" ON "audit_logs" ("userId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_clinic_created" ON "audit_logs" ("clinicId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_patient_created" ON "audit_logs" ("patientId", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_action_created" ON "audit_logs" ("action", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
  }
}
