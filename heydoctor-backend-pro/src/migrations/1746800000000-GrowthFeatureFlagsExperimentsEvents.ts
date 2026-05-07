import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrowthFeatureFlagsExperimentsEvents1746800000000
  implements MigrationInterface
{
  name = 'GrowthFeatureFlagsExperimentsEvents1746800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "feature_flags" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "key" varchar(128) NOT NULL UNIQUE,
        "enabled" boolean NOT NULL DEFAULT true,
        "rollout_percentage" smallint NOT NULL DEFAULT 100 CHECK (
          rollout_percentage >= 0 AND rollout_percentage <= 100
        ),
        "forced_on_user_ids" uuid[] NOT NULL DEFAULT '{}',
        "forced_off_user_ids" uuid[] NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE "growth_experiments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "key" varchar(128) NOT NULL UNIQUE,
        "enabled" boolean NOT NULL DEFAULT true,
        "variants" jsonb NOT NULL DEFAULT '["A","B"]',
        "traffic_split" jsonb NOT NULL DEFAULT '{"A":50,"B":50}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE "product_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid REFERENCES "users" ("id") ON DELETE SET NULL,
        "event_name" varchar(128) NOT NULL,
        "properties" jsonb DEFAULT '{}',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX "IDX_product_events_name_created_at"
        ON "product_events" ("event_name", "created_at");
      CREATE INDEX "IDX_product_events_user_created_at"
        ON "product_events" ("user_id", "created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_experiments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "feature_flags"`);
  }
}
