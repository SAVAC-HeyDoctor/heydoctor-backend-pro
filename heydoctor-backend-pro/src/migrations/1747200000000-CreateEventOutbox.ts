import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEventOutbox1747200000000 implements MigrationInterface {
  name = 'CreateEventOutbox1747200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS event_outbox (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type text NOT NULL,
        payload jsonb NOT NULL,
        processed boolean NOT NULL DEFAULT false,
        idempotency_key text,
        retry_count integer NOT NULL DEFAULT 0,
        last_error text,
        processed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_event_outbox_processed_created_at"
      ON event_outbox (processed, created_at)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_event_outbox_idempotency_key"
      ON event_outbox (idempotency_key)
      WHERE idempotency_key IS NOT NULL
    `);
  }

  public async down(): Promise<void> {
    // Intentionally no-op: outbox rows are delivery state and must not be dropped by rollback.
  }
}
