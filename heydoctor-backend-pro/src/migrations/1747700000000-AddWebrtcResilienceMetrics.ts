import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebrtcResilienceMetrics1747700000000
  implements MigrationInterface
{
  name = 'AddWebrtcResilienceMetrics1747700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE webrtc_metric_samples
      ADD COLUMN IF NOT EXISTS event_type varchar(64)
    `);
    await queryRunner.query(`
      ALTER TABLE webrtc_metric_samples
      ADD COLUMN IF NOT EXISTS event_count integer
    `);
  }

  public async down(): Promise<void> {
    // Intentionally no-op: operational telemetry should be retained.
  }
}
