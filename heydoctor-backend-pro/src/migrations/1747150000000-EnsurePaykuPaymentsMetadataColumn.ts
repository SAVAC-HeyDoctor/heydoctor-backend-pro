import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Idempotente: añade `metadata` como jsonb sin asumir estado previo (deploys Railway).
 * Paso 2: normaliza NULLs antes de DEFAULT y NOT NULL.
 */
export class EnsurePaykuPaymentsMetadataColumn1747150000000
  implements MigrationInterface
{
  name = 'EnsurePaykuPaymentsMetadataColumn1747150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payku_payments"
      ADD COLUMN IF NOT EXISTS "metadata" jsonb;
    `);
    await queryRunner.query(`
      UPDATE "payku_payments"
      SET "metadata" = '{}'::jsonb
      WHERE "metadata" IS NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "payku_payments"
      ALTER COLUMN "metadata" SET DEFAULT '{}'::jsonb;
    `);
    await queryRunner.query(`
      ALTER TABLE "payku_payments"
      ALTER COLUMN "metadata" SET NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payku_payments" DROP COLUMN IF EXISTS "metadata";
    `);
  }
}
