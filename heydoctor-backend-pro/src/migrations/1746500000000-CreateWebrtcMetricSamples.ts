import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWebrtcMetricSamples1746500000000 implements MigrationInterface {
  name = 'CreateWebrtcMetricSamples1746500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "webrtc_metric_samples" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "consultation_id" uuid NOT NULL,
        "reported_by_user_id" uuid NOT NULL,
        "rtt_ms" double precision,
        "packet_loss_ratio" double precision,
        "outbound_bitrate_bps" double precision,
        "jitter_ms" double precision,
        "packets_lost" integer,
        "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webrtc_metric_samples" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_webrtc_metric_samples_consultation_recorded"
      ON "webrtc_metric_samples" ("consultation_id", "recorded_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_webrtc_metric_samples_consultation_recorded"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "webrtc_metric_samples"`);
  }
}
