import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefreshTokenRotationFamily1747500000000
  implements MigrationInterface
{
  name = 'RefreshTokenRotationFamily1747500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE refresh_tokens
      ADD COLUMN IF NOT EXISTS family_id uuid
    `);
    await queryRunner.query(`
      ALTER TABLE refresh_tokens
      ADD COLUMN IF NOT EXISTS replaced_by_token_id uuid
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_family_id"
      ON refresh_tokens ("family_id")
    `);
  }

  public async down(): Promise<void> {
    // Intentionally no-op: refresh-token audit/session lineage is security data.
  }
}
