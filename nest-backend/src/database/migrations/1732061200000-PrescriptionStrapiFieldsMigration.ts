import { MigrationInterface, QueryRunner } from 'typeorm';

/** Adds Strapi-aligned fields: diagnosisId, dosage, instructions. */
export class PrescriptionStrapiFieldsMigration1732061200000
  implements MigrationInterface
{
  name = 'PrescriptionStrapiFieldsMigration1732061200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('prescriptions');
    if (!table) return;

    const colsToAdd = [
      { name: 'diagnosisId', type: 'uuid', nullable: true },
      { name: 'dosage', type: 'text', nullable: true },
      { name: 'instructions', type: 'text', nullable: true },
    ];

    for (const col of colsToAdd) {
      const exists = table.columns.find((c) => c.name === col.name);
      if (!exists) {
        await queryRunner.query(
          `ALTER TABLE "prescriptions" ADD COLUMN "${col.name}" ${col.type} NULL`,
        );
      }
    }

    const refreshedTable = await queryRunner.getTable('prescriptions');
    if (refreshedTable?.columns.find((c) => c.name === 'diagnosisId')) {
      try {
        await queryRunner.query(`
          ALTER TABLE "prescriptions"
          ADD CONSTRAINT "FK_prescriptions_diagnosis"
          FOREIGN KEY ("diagnosisId") REFERENCES "diagnostics"("id") ON DELETE SET NULL
        `);
      } catch {
        /* FK may already exist */
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "prescriptions" DROP CONSTRAINT IF EXISTS "FK_prescriptions_diagnosis"`,
    );
    await queryRunner.query(
      `ALTER TABLE "prescriptions" DROP COLUMN IF EXISTS "diagnosisId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "prescriptions" DROP COLUMN IF EXISTS "dosage"`,
    );
    await queryRunner.query(
      `ALTER TABLE "prescriptions" DROP COLUMN IF EXISTS "instructions"`,
    );
  }
}
