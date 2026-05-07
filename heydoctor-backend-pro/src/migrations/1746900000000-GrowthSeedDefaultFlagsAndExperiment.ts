import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrowthSeedDefaultFlagsAndExperiment1746900000000
  implements MigrationInterface
{
  name = 'GrowthSeedDefaultFlagsAndExperiment1746900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "feature_flags" ("key", "enabled", "rollout_percentage")
      VALUES
        ('new_growth_dashboard', true, 100),
        ('experiment_pricing_page', true, 100)
      ON CONFLICT ("key") DO UPDATE SET
        "enabled" = EXCLUDED."enabled",
        "rollout_percentage" = EXCLUDED."rollout_percentage",
        "updated_at" = now();

      INSERT INTO "growth_experiments" ("key", "enabled", "variants", "traffic_split")
      VALUES
        (
          'pricing_upgrade_cta',
          true,
          '["A","B"]'::jsonb,
          '{"A":50,"B":50}'::jsonb
        )
      ON CONFLICT ("key") DO UPDATE SET
        "enabled" = EXCLUDED."enabled",
        "variants" = EXCLUDED."variants",
        "traffic_split" = EXCLUDED."traffic_split",
        "updated_at" = now();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "growth_experiments" WHERE "key" = 'pricing_upgrade_cta';
      DELETE FROM "feature_flags" WHERE "key" IN ('new_growth_dashboard', 'experiment_pricing_page');
    `);
  }
}
