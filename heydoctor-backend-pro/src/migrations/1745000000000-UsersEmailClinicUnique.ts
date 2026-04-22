import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-tenant users: (email, clinic_id) único; mismo email permitido en otras clínicas.
 * No borra datos. Elimina UNIQUE(email) del InitialSchema u otras convenciones de nombre.
 */
export class UsersEmailClinicUnique1745000000000 implements MigrationInterface {
  name = 'UsersEmailClinicUnique1745000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_97672ac88f789774dd47f7c8be3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_key"`,
    );

    await queryRunner.query(`
      CREATE UNIQUE INDEX "users_email_clinic_unique"
      ON "users" ("email", "clinic_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "users_email_clinic_unique"`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email")`,
    );
  }
}
