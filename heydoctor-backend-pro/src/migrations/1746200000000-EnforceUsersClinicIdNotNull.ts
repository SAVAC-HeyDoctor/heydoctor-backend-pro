import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fuerza NOT NULL en users.clinic_id (columna física `clinic_id`).
 *
 * Backfill: cada usuario con NULL recibe la primera clínica (por `created_at`) donde
 * el par (email, clinic_id) aún no exista en otro usuario, para no violar
 * `users_email_clinic_unique`.
 *
 * Si tras el UPDATE quedan filas con NULL (p. ej. mismo email en varios usuarios
 * huérfanos y una sola clínica), la migración falla: revisar datos o crear clínicas.
 */
export class EnforceUsersClinicIdNotNull1746200000000
  implements MigrationInterface
{
  name = 'EnforceUsersClinicIdNotNull1746200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users" u
      SET "clinic_id" = pick.chosen_clinic_id
      FROM (
        SELECT
          u_inner.id AS user_id,
          (
            SELECT c.id
            FROM "clinics" c
            WHERE NOT EXISTS (
              SELECT 1
              FROM "users" u2
              WHERE u2.id <> u_inner.id
                AND u2.email = u_inner.email
                AND u2.clinic_id = c.id
            )
            ORDER BY c.created_at ASC
            LIMIT 1
          ) AS chosen_clinic_id
        FROM "users" u_inner
        WHERE u_inner.clinic_id IS NULL
      ) AS pick
      WHERE u.id = pick.user_id
        AND pick.chosen_clinic_id IS NOT NULL
    `);

    const remaining = await queryRunner.query(`
      SELECT id FROM "users" WHERE "clinic_id" IS NULL
    `);
    if (remaining.length > 0) {
      const ids = remaining.map((r: { id: string }) => r.id).join(', ');
      throw new Error(
        `EnforceUsersClinicIdNotNull: quedan ${remaining.length} usuario(s) sin clinic_id (conflicto único email/clínica o sin clínicas). IDs: ${ids}`,
      );
    }

    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "clinic_id" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "clinic_id" DROP NOT NULL
    `);
  }
}
