import type { QueryRunner } from 'typeorm';
import { MultiTenantClinicIdCoreEntities1746300000000 } from './1746300000000-MultiTenantClinicIdCoreEntities';
import { GrowthSeedDefaultFlagsAndExperiment1746900000000 } from './1746900000000-GrowthSeedDefaultFlagsAndExperiment';

function createQueryRunnerMock(
  handler: (sql: string) => unknown[] = () => [],
): { queryRunner: QueryRunner; queries: string[] } {
  const queries: string[] = [];
  const queryRunner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql);
      return handler(sql);
    }),
  } as unknown as QueryRunner;

  return { queryRunner, queries };
}

describe('migration safety', () => {
  it('skips default tenant backfills when clinics table is empty', async () => {
    const migration = new MultiTenantClinicIdCoreEntities1746300000000();
    const { queryRunner, queries } = createQueryRunnerMock((sql) => {
      if (/SELECT id FROM clinics/i.test(sql)) return [];
      return [];
    });

    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    expect(queries.some((sql) => /INSERT INTO clinics/i.test(sql))).toBe(false);
    expect(queries.some((sql) => /SET clinic_id = \$1/i.test(sql))).toBe(false);
    expect(queries.some((sql) => /DELETE FROM daily_metrics/i.test(sql))).toBe(
      false,
    );
  });

  it('keeps destructive multi-tenant rollback as an explicit no-op', async () => {
    const migration = new MultiTenantClinicIdCoreEntities1746300000000();
    const { queryRunner } = createQueryRunnerMock();

    await expect(migration.down(queryRunner)).resolves.toBeUndefined();
    expect(queryRunner.query).not.toHaveBeenCalled();
  });

  it('seeds growth defaults without overwriting production rollout config', async () => {
    const migration = new GrowthSeedDefaultFlagsAndExperiment1746900000000();
    const { queryRunner, queries } = createQueryRunnerMock();

    await migration.up(queryRunner);

    const seedSql = queries.join('\n');
    expect(seedSql).toContain('ON CONFLICT ("key") DO NOTHING');
    expect(seedSql).not.toContain('DO UPDATE');
  });

  it('keeps growth seed rollback as an explicit no-op', async () => {
    const migration = new GrowthSeedDefaultFlagsAndExperiment1746900000000();
    const { queryRunner } = createQueryRunnerMock();

    await expect(migration.down(queryRunner)).resolves.toBeUndefined();
    expect(queryRunner.query).not.toHaveBeenCalled();
  });
});
