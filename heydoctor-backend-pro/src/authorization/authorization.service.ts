import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { DoctorProfilesService } from '../doctor-profiles/doctor-profiles.service';
import { Patient } from '../patients/patient.entity';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';

export type UserWithClinicContext = {
  user: User;
  clinicId: string;
};

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => DoctorProfilesService))
    private readonly doctorProfilesService: DoctorProfilesService,
    @InjectRepository(Patient)
    private readonly patientsRepository: Repository<Patient>,
  ) {}

  /**
   * Si el usuario pertenece a la clínica y tiene perfil de médico, devuelve `{ id: userId }`
   * para filtrar `consultations.doctor_id`. Si no es médico o no aplica, `null`.
   */
  async resolveDoctorForUser(
    userId: string,
    clinicId: string,
  ): Promise<{ id: string } | null> {
    try {
      const user = await this.usersService.findById(userId);
      if (!user?.clinicId || user.clinicId !== clinicId) {
        return null;
      }
      const profile = await this.doctorProfilesService.findByUserId(userId);
      if (!profile) {
        return null;
      }
      return { id: userId };
    } catch {
      return null;
    }
  }

  /**
   * Single DB read: authenticated user + verified clinicId (never from JWT).
   */
  async getUserWithClinic(
    authUser: AuthenticatedUser,
  ): Promise<UserWithClinicContext> {
    const user = await this.usersService.findById(authUser.sub);
    if (!user) {
      throw new ForbiddenException('User has no clinic assigned');
    }
    if (!user.clinicId) {
      throw new ForbiddenException('User has no clinic assigned');
    }
    return { user, clinicId: user.clinicId };
  }

  /**
   * Ensures the authenticated user belongs to `clinicId`.
   * Pass `loadedUser` to skip a duplicate findById when context was just resolved
   * (e.g. after {@link getUserWithClinic}).
   */
  assertUserInClinic(
    authUser: AuthenticatedUser,
    clinicId: string,
  ): Promise<void>;
  assertUserInClinic(
    authUser: AuthenticatedUser,
    clinicId: string,
    loadedUser: User,
  ): Promise<void>;
  async assertUserInClinic(
    authUser: AuthenticatedUser,
    clinicId: string,
    loadedUser?: User,
  ): Promise<void> {
    const user =
      loadedUser ?? (await this.usersService.findById(authUser.sub));

    if (!user?.clinicId) {
      throw new ForbiddenException('User has no clinic assigned');
    }
    if (loadedUser && loadedUser.id !== authUser.sub) {
      throw new ForbiddenException('Access denied for this clinic');
    }
    if (user.clinicId !== clinicId) {
      throw new ForbiddenException('Access denied for this clinic');
    }
  }

  /**
   * Ensures the patient exists and belongs to the same clinic as the authenticated user.
   */
  async assertPatientInClinic(
    authUser: AuthenticatedUser,
    patientId: string,
  ): Promise<Patient> {
    const { clinicId } = await this.getUserWithClinic(authUser);
    return this.assertPatientInClinicWithContext(authUser, patientId, clinicId);
  }

  /**
   * Misma regla que {@link assertPatientInClinic} sin volver a cargar el usuario
   * (usar cuando ya tienes `clinicId` de {@link getUserWithClinic}).
   */
  async assertPatientInClinicWithContext(
    authUser: AuthenticatedUser,
    patientId: string,
    clinicId: string,
  ): Promise<Patient> {
    const patient = await this.patientsRepository.findOne({
      where: { id: patientId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    if (patient.clinicId !== clinicId) {
      throw new ForbiddenException(
        'Patient does not belong to your clinic',
      );
    }

    await this.assertPatientOwnership(authUser, patient);
    return patient;
  }

  /**
   * Placeholder for future per-resource ownership (e.g. assigned doctor).
   */
  async assertPatientOwnership(
    _authUser: AuthenticatedUser,
    _patient: Patient,
  ): Promise<boolean> {
    return true;
  }
}
