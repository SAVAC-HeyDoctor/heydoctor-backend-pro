import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebrtcConnectionStateMetrics1747600000000 implements MigrationInterface {
  name = 'AddWebrtcConnectionStateMetrics1747600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE webrtc_metric_samples
      ADD COLUMN IF NOT EXISTS ice_connection_state varchar(32)
    `);
    await queryRunner.query(`
      ALTER TABLE webrtc_metric_samples
      ADD COLUMN IF NOT EXISTS connection_state varchar(32)
    `);
    await queryRunner.query(`
      ALTER TABLE webrtc_metric_samples
      ADD COLUMN IF NOT EXISTS signaling_state varchar(32)
    `);
  }

  public async down(): Promise<void> {
    // Intentionally no-op: historical call-quality telemetry should be retained.
  }
}
