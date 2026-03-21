import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConsultationEntityMigration1732060900000 implements MigrationInterface {
  name = 'ConsultationEntityMigration1732060900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('appointments');
    if (!table) {
      return;
    }

    // 1. Rename scheduledAt -> date if exists
    const hasScheduledAt = table.columns.find((c) => c.name === 'scheduledAt');
    const hasDate = table.columns.find((c) => c.name === 'date');
    if (hasScheduledAt && !hasDate) {
      await queryRunner.renameColumn('appointments', 'scheduledAt', 'date');
    }

    // 2. Rename reason -> appointment_reason if exists
    const hasReason = table.columns.find((c) => c.name === 'reason');
    const hasAppointmentReason = table.columns.find(
      (c) => c.name === 'appointment_reason',
    );
    if (hasReason && !hasAppointmentReason) {
      await queryRunner.renameColumn(
        'appointments',
        'reason',
        'appointment_reason',
      );
    }

    // 3. Add new columns to appointments
    const refreshedTable = await queryRunner.getTable('appointments');
    const colsToAdd = [
      { name: 'duration', type: 'integer', default: 45 },
      { name: 'clinicalRecordId', type: 'uuid', nullable: true },
      { name: 'confirmed', type: 'boolean', default: false },
      { name: 'files', type: 'jsonb', nullable: true },
      { name: 'active', type: 'boolean', default: true },
    ];

    for (const col of colsToAdd) {
      const exists = refreshedTable?.columns.find((c) => c.name === col.name);
      if (!exists) {
        let sql = `ALTER TABLE "appointments" ADD COLUMN "${col.name}" ${col.type}`;
        if ('default' in col) {
          sql += ` DEFAULT ${typeof col.default === 'boolean' ? col.default : col.default}`;
        }
        if (col.nullable !== false) {
          sql += ' NULL';
        }
        await queryRunner.query(sql);
      }
    }

    // 4. Add consultationId to diagnostics
    const diagTable = await queryRunner.getTable('diagnostics');
    const diagHasConsultationId = diagTable?.columns.find(
      (c) => c.name === 'consultationId',
    );
    if (!diagHasConsultationId) {
      await queryRunner.query(
        `ALTER TABLE "diagnostics" ADD COLUMN "consultationId" uuid NULL`,
      );
      await queryRunner.query(`
        ALTER TABLE "diagnostics"
        ADD CONSTRAINT "FK_diagnostics_consultation"
        FOREIGN KEY ("consultationId") REFERENCES "appointments"("id") ON DELETE SET NULL
      `);
    }

    // 5. Add consultationId to lab_orders
    const labTable = await queryRunner.getTable('lab_orders');
    const labHasConsultationId = labTable?.columns.find(
      (c) => c.name === 'consultationId',
    );
    if (!labHasConsultationId) {
      await queryRunner.query(
        `ALTER TABLE "lab_orders" ADD COLUMN "consultationId" uuid NULL`,
      );
      await queryRunner.query(`
        ALTER TABLE "lab_orders"
        ADD CONSTRAINT "FK_lab_orders_consultation"
        FOREIGN KEY ("consultationId") REFERENCES "appointments"("id") ON DELETE SET NULL
      `);
    }

    // 6. Add consultationId to prescriptions
    const rxTable = await queryRunner.getTable('prescriptions');
    const rxHasConsultationId = rxTable?.columns.find(
      (c) => c.name === 'consultationId',
    );
    if (!rxHasConsultationId) {
      await queryRunner.query(
        `ALTER TABLE "prescriptions" ADD COLUMN "consultationId" uuid NULL`,
      );
      await queryRunner.query(`
        ALTER TABLE "prescriptions"
        ADD CONSTRAINT "FK_prescriptions_consultation"
        FOREIGN KEY ("consultationId") REFERENCES "appointments"("id") ON DELETE SET NULL
      `);
    }

    // 7. Add clinicalRecordId FK to appointments if not exists
    const aptHasClinicalRecordId = refreshedTable?.columns.find(
      (c) => c.name === 'clinicalRecordId',
    );
    if (aptHasClinicalRecordId) {
      try {
        await queryRunner.query(`
          ALTER TABLE "appointments"
          ADD CONSTRAINT "FK_appointments_clinical_record"
          FOREIGN KEY ("clinicalRecordId") REFERENCES "clinical_records"("id") ON DELETE SET NULL
        `);
      } catch {
        // FK may already exist
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove FKs and columns
    await queryRunner.query(
      `ALTER TABLE "diagnostics" DROP CONSTRAINT IF EXISTS "FK_diagnostics_consultation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "diagnostics" DROP COLUMN IF EXISTS "consultationId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "lab_orders" DROP CONSTRAINT IF EXISTS "FK_lab_orders_consultation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lab_orders" DROP COLUMN IF EXISTS "consultationId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "prescriptions" DROP CONSTRAINT IF EXISTS "FK_prescriptions_consultation"`,
    );
    await queryRunner.query(
      `ALTER TABLE "prescriptions" DROP COLUMN IF EXISTS "consultationId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "FK_appointments_clinical_record"`,
    );

    const table = await queryRunner.getTable('appointments');
    if (table) {
      const colsToDrop = [
        'duration',
        'clinicalRecordId',
        'confirmed',
        'files',
        'active',
      ];
      for (const col of colsToDrop) {
        await queryRunner.query(
          `ALTER TABLE "appointments" DROP COLUMN IF EXISTS "${col}"`,
        );
      }

      const hasDate = table.columns.find((c) => c.name === 'date');
      if (hasDate) {
        await queryRunner.renameColumn('appointments', 'date', 'scheduledAt');
      }

      const hasAppointmentReason = table.columns.find(
        (c) => c.name === 'appointment_reason',
      );
      if (hasAppointmentReason) {
        await queryRunner.renameColumn(
          'appointments',
          'appointment_reason',
          'reason',
        );
      }
    }
  }
}
