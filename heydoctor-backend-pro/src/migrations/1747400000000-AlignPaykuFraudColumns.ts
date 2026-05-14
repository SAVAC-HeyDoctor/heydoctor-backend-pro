import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignPaykuFraudColumns1747400000000
  implements MigrationInterface
{
  name = 'AlignPaykuFraudColumns1747400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payku_payments"
        ADD COLUMN IF NOT EXISTS "fraud_flag" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "risk_score" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "fraud_reason" text
    `);
  }

  public async down(): Promise<void> {
    // Intentionally no-op: payment fraud signals are operational audit data.
  }
}
