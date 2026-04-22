import { UserRole } from '../../users/user-role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  /** Puede ser null en datos legados o hasta asignar clínica. */
  clinicId: string | null;
}
