import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaykuPaymentMetadata1747100000000 implements MigrationInterface {
  name = 'PaykuPaymentMetadata1747100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payku_payments"
      ADD COLUMN IF NOT EXISTS "metadata" jsonb NOT NULL DEFAULT '{}';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payku_payments" DROP COLUMN IF EXISTS "metadata";
    `);
  }
}
