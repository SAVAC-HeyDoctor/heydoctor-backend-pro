import { MigrationInterface, QueryRunner } from 'typeorm';

export class GrowthSeedDefaultFlagsAndExperiment1746900000000 implements MigrationInterface {
  name = 'GrowthSeedDefaultFlagsAndExperiment1746900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "feature_flags" ("key", "enabled", "rollout_percentage")
      VALUES
        ('new_growth_dashboard', true, 100),
        ('experiment_pricing_page', true, 100)
      ON CONFLICT ("key") DO NOTHING;

      INSERT INTO "growth_experiments" ("key", "enabled", "variants", "traffic_split")
      VALUES
        (
          'pricing_upgrade_cta',
          true,
          '["A","B"]'::jsonb,
          '{"A":50,"B":50}'::jsonb
        )
      ON CONFLICT ("key") DO NOTHING;
    `);
  }

  public async down(): Promise<void> {
    // Intentionally no-op: seeded rollout rows can be changed by production ops.
  }
}
