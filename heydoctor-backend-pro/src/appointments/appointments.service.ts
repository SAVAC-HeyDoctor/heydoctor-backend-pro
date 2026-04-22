import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  type LoggerService,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { assignClinic } from '../common/entity-clinic.util';
import { APP_LOGGER } from '../common/logger/logger.tokens';
import { AuthorizationService } from '../authorization/authorization.service';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/user-role.enum';
import { Appointment } from './appointment.entity';
import { AppointmentStatus } from './appointment-status.enum';
import type { CreateAppointmentDto } from './dto/create-appointment.dto';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export type AppointmentPublicActionResponse =
  | {
      success: true;
      status: 'confirmed' | 'cancelled';
      message: string;
    }
  | { success: false; message: string };

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidV4(value: string): boolean {
  return UUID_V4_RE.test(value);
}

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment)
    private readonly appointmentsRepository: Repository<Appointment>,
    private readonly authorizationService: AuthorizationService,
    private readonly usersService: UsersService,
    @Inject(APP_LOGGER)
    private readonly logger: LoggerService,
  ) {}

  /**
   * Staff-only: crea cita con token de confirmación (24h), pensado para enviar link al paciente.
   */
  async create(
    dto: CreateAppointmentDto,
    authUser: AuthenticatedUser,
  ): Promise<Appointment> {
    const { clinicId } =
      await this.authorizationService.getUserWithClinic(authUser);
    await this.authorizationService.assertPatientInClinic(
      authUser,
      dto.patientId,
    );

    let doctorId = authUser.sub;
    if (authUser.role === UserRole.ADMIN) {
      if (!dto.doctorId) {
        throw new BadRequestException(
          'doctorId is required when creating an appointment as admin',
        );
      }
      const doctorUser = await this.usersService.findById(dto.doctorId);
      if (!doctorUser || doctorUser.clinicId !== clinicId) {
        throw new ForbiddenException('Doctor is not in this clinic');
      }
      doctorId = dto.doctorId;
    }

    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException('Invalid startsAt');
    }

    const confirmationToken = randomUUID();
    const confirmationTokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    const entity = this.appointmentsRepository.create({
      patient: { id: dto.patientId },
      doctor: { id: doctorId },
      startsAt,
      status: AppointmentStatus.PENDING,
      confirmationToken,
      confirmationTokenExpiresAt,
    });
    assignClinic(entity, clinicId);

    return this.appointmentsRepository.save(entity);
  }

  async confirmByToken(rawToken: string): Promise<AppointmentPublicActionResponse> {
    if (!isUuidV4(rawToken)) {
      this.logger.warn('Invalid appointment confirmation attempt', {
        reason: 'malformed_token',
      });
      return {
        success: false,
        message: 'El enlace no es válido o ha expirado',
      };
    }

    const row = await this.appointmentsRepository.findOne({
      where: { confirmationToken: rawToken },
    });

    if (!row) {
      this.logger.warn('Invalid appointment confirmation attempt', {
        reason: 'token_not_found',
      });
      return {
        success: false,
        message: 'El enlace no es válido o ha expirado',
      };
    }

    const now = new Date();
    if (
      row.confirmationTokenExpiresAt &&
      row.confirmationTokenExpiresAt.getTime() < now.getTime()
    ) {
      this.logger.warn('Invalid appointment confirmation attempt', {
        reason: 'token_expired',
        appointmentId: row.id,
        clinicId: row.clinicId,
      });
      return {
        success: false,
        message: 'El enlace no es válido o ha expirado',
      };
    }

    if (row.status === AppointmentStatus.CANCELLED) {
      this.logger.warn('Invalid appointment confirmation attempt', {
        reason: 'already_cancelled',
        appointmentId: row.id,
        clinicId: row.clinicId,
      });
      return {
        success: false,
        message: 'El enlace no es válido o ha expirado',
      };
    }

    if (row.status === AppointmentStatus.CONFIRMED) {
      this.logger.log('Appointment confirmed', {
        appointmentId: row.id,
        clinicId: row.clinicId,
      });
      return {
        success: true,
        status: 'confirmed',
        message: 'Su cita ya estaba confirmada',
      };
    }

    row.status = AppointmentStatus.CONFIRMED;
    row.confirmationToken = null;
    row.confirmationTokenExpiresAt = null;
    await this.appointmentsRepository.save(row);

    this.logger.log('Appointment confirmed', {
      appointmentId: row.id,
      clinicId: row.clinicId,
    });

    return {
      success: true,
      status: 'confirmed',
      message: 'Su cita ha sido confirmada',
    };
  }

  async cancelByToken(rawToken: string): Promise<AppointmentPublicActionResponse> {
    if (!isUuidV4(rawToken)) {
      this.logger.warn('Invalid appointment confirmation attempt', {
        reason: 'malformed_token_cancel',
      });
      return {
        success: false,
        message: 'El enlace no es válido o ha expirado',
      };
    }

    const row = await this.appointmentsRepository.findOne({
      where: { confirmationToken: rawToken },
    });

    if (!row) {
      this.logger.warn('Invalid appointment confirmation attempt', {
        reason: 'token_not_found_cancel',
      });
      return {
        success: false,
        message: 'El enlace no es válido o ha expirado',
      };
    }

    const now = new Date();
    if (
      row.confirmationTokenExpiresAt &&
      row.confirmationTokenExpiresAt.getTime() < now.getTime()
    ) {
      this.logger.warn('Invalid appointment confirmation attempt', {
        reason: 'token_expired_cancel',
        appointmentId: row.id,
        clinicId: row.clinicId,
      });
      return {
        success: false,
        message: 'El enlace no es válido o ha expirado',
      };
    }

    if (row.status === AppointmentStatus.CANCELLED) {
      this.logger.log('Appointment cancelled', {
        appointmentId: row.id,
        clinicId: row.clinicId,
      });
      return {
        success: true,
        status: 'cancelled',
        message: 'Su cita ya estaba cancelada',
      };
    }

    row.status = AppointmentStatus.CANCELLED;
    row.confirmationToken = null;
    row.confirmationTokenExpiresAt = null;
    await this.appointmentsRepository.save(row);

    this.logger.log('Appointment cancelled', {
      appointmentId: row.id,
      clinicId: row.clinicId,
    });

    return {
      success: true,
      status: 'cancelled',
      message: 'Su cita ha sido cancelada',
    };
  }
}
