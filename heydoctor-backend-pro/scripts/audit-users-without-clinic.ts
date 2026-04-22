/**
 * Lista usuarios cuya columna `clinic_id` es NULL (auditoría / datos legados).
 *
 * Ejecutar desde la raíz de `heydoctor-backend-pro` (mismas variables que migraciones):
 *
 *   npx ts-node -r tsconfig-paths/register scripts/audit-users-without-clinic.ts
 *
 * Requiere `DATABASE_URL` o `DATABASE_PUBLIC_URL` en `.env` o `.env.local`.
 */
import 'reflect-metadata';
import dataSource from '../src/data-source';
import { User } from '../src/users/user.entity';

type AuditRow = {
  id: string;
  email: string;
  role: string;
  clinicId: string | null;
};

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    const rows = await dataSource
      .getRepository(User)
      .createQueryBuilder('u')
      .select(['u.id', 'u.email', 'u.role', 'u.clinicId'])
      .where('u.clinic_id IS NULL')
      .getMany();

    const payload: AuditRow[] = rows.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      clinicId: u.clinicId ?? null,
    }));

    console.log('Users without clinicId:');
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
