import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiInsightsMigration1732061400000 implements MigrationInterface {
  name = 'AiInsightsMigration1732061400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_insights" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "patientId" uuid NOT NULL,
        "consultationId" uuid NULL,
        "clinicId" uuid NULL,
        "predicted_conditions" jsonb NULL,
        "risk_scores" jsonb NULL,
        "clinical_patterns" jsonb NULL,
        "recommended_actions" jsonb NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_insights" PRIMARY KEY ("id"),
        CONSTRAINT "FK_ai_insights_patient" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_ai_insights_consultation" FOREIGN KEY ("consultationId") REFERENCES "appointments"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_ai_insights_patientId" ON "ai_insights" ("patientId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_insights_consultationId" ON "ai_insights" ("consultationId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_insights_createdAt" ON "ai_insights" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ai_insights"`);
  }
}
