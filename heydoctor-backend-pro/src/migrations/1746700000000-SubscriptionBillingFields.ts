import { MigrationInterface, QueryRunner } from 'typeorm';

export class SubscriptionBillingFields1746700000000 implements MigrationInterface {
  name = 'SubscriptionBillingFields1746700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "price" numeric(12, 2) NOT NULL DEFAULT '0';
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "current_period_start" TIMESTAMP WITH TIME ZONE;
    `);
    await queryRunner.query(`
      ALTER TABLE "subscriptions"
      ADD COLUMN IF NOT EXISTS "current_period_end" TIMESTAMP WITH TIME ZONE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "current_period_end"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "current_period_start"`,
    );
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "price"`);
  }
}
