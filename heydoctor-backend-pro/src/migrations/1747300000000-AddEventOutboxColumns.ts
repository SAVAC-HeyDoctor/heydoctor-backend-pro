import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEventOutboxColumns1747300000000 implements MigrationInterface {
  name = 'AddEventOutboxColumns1747300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE event_outbox
        ADD COLUMN IF NOT EXISTS failed boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS failed_at timestamptz,
        ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
        ADD COLUMN IF NOT EXISTS last_error text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE event_outbox
        DROP COLUMN IF EXISTS failed,
        DROP COLUMN IF EXISTS failed_at,
        DROP COLUMN IF EXISTS next_attempt_at,
        DROP COLUMN IF EXISTS last_error
    `);
  }
}
