import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignEventOutboxSchema1747300000000
  implements MigrationInterface
{
  name = 'AlignEventOutboxSchema1747300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE event_outbox
      ADD COLUMN IF NOT EXISTS failed boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      ALTER TABLE event_outbox
      ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE event_outbox
      ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz
    `);

    await queryRunner.query(`
      ALTER TABLE event_outbox
      ADD COLUMN IF NOT EXISTS last_error text
    `);
  }

  public async down(): Promise<void> {
    // Intentionally no-op: outbox delivery state must remain queryable after rollback.
  }
}
