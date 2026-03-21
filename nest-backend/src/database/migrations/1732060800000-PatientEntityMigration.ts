import { MigrationInterface, QueryRunner } from 'typeorm';

export class PatientEntityMigration1732060800000 implements MigrationInterface {
  name = 'PatientEntityMigration1732060800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('patients');
    if (!table) {
      return;
    }

    // 1. Add new columns (nullable, preserve existing data)
    const columnsToAdd = [
      { name: 'identification_type', type: 'varchar', nullable: true },
      { name: 'city', type: 'varchar', nullable: true },
      { name: 'province', type: 'varchar', nullable: true },
      { name: 'uid', type: 'varchar', nullable: true },
      { name: 'profile_picture', type: 'varchar', nullable: true },
    ];

    for (const col of columnsToAdd) {
      const exists = table.columns.find((c) => c.name === col.name);
      if (!exists) {
        await queryRunner.query(
          `ALTER TABLE "patients" ADD COLUMN "${col.name}" ${col.type}`,
        );
      }
    }

    // 2. Rename firstName -> firstname (preserves data)
    const hasFirstName = table.columns.find(
      (c) => c.name === 'firstName' || c.name === 'firstname',
    );
    if (hasFirstName?.name === 'firstName') {
      await queryRunner.renameColumn('patients', 'firstName', 'firstname');
    }

    // 3. Rename documentNumber -> identification (preserves data)
    const hasDocumentNumber = table.columns.find(
      (c) => c.name === 'documentNumber' || c.name === 'identification',
    );
    if (hasDocumentNumber?.name === 'documentNumber') {
      await queryRunner.renameColumn(
        'patients',
        'documentNumber',
        'identification',
      );
    }

    // 4. Rename lastName -> lastname, dateOfBirth -> birth_date
    const refreshedTable = await queryRunner.getTable('patients');
    const hasLastName = refreshedTable?.columns.find(
      (c) => c.name === 'lastName' || c.name === 'lastname',
    );
    if (hasLastName?.name === 'lastName') {
      await queryRunner.renameColumn('patients', 'lastName', 'lastname');
    }

    const hasDateOfBirth = refreshedTable?.columns.find(
      (c) => c.name === 'dateOfBirth' || c.name === 'birth_date',
    );
    if (hasDateOfBirth?.name === 'dateOfBirth') {
      await queryRunner.renameColumn('patients', 'dateOfBirth', 'birth_date');
    }

    // 5. Create patient_favorite_doctors join table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "patient_favorite_doctors" (
        "patient_id" uuid NOT NULL,
        "doctor_id" uuid NOT NULL,
        CONSTRAINT "PK_patient_favorite_doctors" PRIMARY KEY ("patient_id", "doctor_id"),
        CONSTRAINT "FK_patient_favorite_doctors_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_patient_favorite_doctors_doctor" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE
      )
    `);

    // 6. Add unique constraint on identification if not exists
    const hasIdentification = refreshedTable?.columns.find(
      (c) => c.name === 'identification',
    );
    if (hasIdentification) {
      try {
        await queryRunner.query(
          `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_patients_identification" ON "patients" ("identification")`,
        );
      } catch {
        // Index may already exist
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop join table
    await queryRunner.query(`DROP TABLE IF EXISTS "patient_favorite_doctors"`);

    // Drop unique index on identification
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_patients_identification"`,
    );

    // Revert column renames
    const table = await queryRunner.getTable('patients');
    if (table) {
      const firstnameCol = table.columns.find((c) => c.name === 'firstname');
      if (firstnameCol) {
        await queryRunner.renameColumn('patients', 'firstname', 'firstName');
      }

      const identificationCol = table.columns.find(
        (c) => c.name === 'identification',
      );
      if (identificationCol) {
        await queryRunner.renameColumn(
          'patients',
          'identification',
          'documentNumber',
        );
      }

      const lastnameCol = table.columns.find((c) => c.name === 'lastname');
      if (lastnameCol) {
        await queryRunner.renameColumn('patients', 'lastname', 'lastName');
      }

      const birthDateCol = table.columns.find((c) => c.name === 'birth_date');
      if (birthDateCol) {
        await queryRunner.renameColumn('patients', 'birth_date', 'dateOfBirth');
      }
    }

    // Drop new columns (PostgreSQL 9.0+ supports DROP COLUMN IF EXISTS)
    const columnsToDrop = [
      'identification_type',
      'city',
      'province',
      'uid',
      'profile_picture',
    ];
    for (const col of columnsToDrop) {
      await queryRunner.query(
        `ALTER TABLE "patients" DROP COLUMN IF EXISTS "${col}"`,
      );
    }
  }
}
