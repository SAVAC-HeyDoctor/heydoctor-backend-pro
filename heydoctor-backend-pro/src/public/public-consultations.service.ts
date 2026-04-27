import { randomUUID } from 'crypto';
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Consultation } from '../consultations/consultation.entity';
import { ConsultationStatus } from '../consultations/consultation-status.enum';
import { Patient } from '../patients/patient.entity';
import { Clinic } from '../clinic/clinic.entity';
import { APP_LOGGER } from '../common/logger/logger.tokens';
import { CreateGuestConsultationDto } from './dto/create-guest-consultation.dto';

/**
 * Resultado del endpoint público. `joinUrl` apunta al frontend (la base se
 * resuelve con `PUBLIC_APP_URL` del backend; si no está, se cae a un dominio
 * por defecto).
 */
export interface CreateGuestConsultationResult {
  consultationId: string;
  joinUrl: string;
  patientId: string;
}

/**
 * Información mínima sobre una consulta accesible sin sesión (para que el
 * frontend valide la entrada de un paciente guest a `/teleconsulta/:id`).
 * **No** exponemos PHI (ni `reason`, ni `notes`, ni `patientId`), solo el
 * status para gating de UI y el flag `isGuest`.
 */
export interface PublicConsultationStatus {
  id: string;
  status: string;
  isGuest: boolean;
}

const NIL_DOCTOR_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Marca interna que distingue una consulta creada por flujo guest vs el flujo
 * autenticado (doctor crea consulta con consent firmado y `consentVersion`
 * real). Persistido en `consultation.consent_version`.
 */
const GUEST_CONSENT_MARKER = 'guest';

@Injectable()
export class PublicConsultationsService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientsRepo: Repository<Patient>,
    @InjectRepository(Consultation)
    private readonly consultationsRepo: Repository<Consultation>,
    @InjectRepository(Clinic)
    private readonly clinicsRepo: Repository<Clinic>,
    @Inject(APP_LOGGER) private readonly logger: Logger,
  ) {}

  async create(
    dto: CreateGuestConsultationDto,
  ): Promise<CreateGuestConsultationResult> {
    const clinicId = await this.resolveGuestClinicId();
    const doctorId = this.resolveGuestDoctorId();

    /**
     * Email sintético único por paciente guest: respeta la restricción
     * `UQ_patients_clinic_email` y permite trazabilidad ("guest-<uuid>").
     */
    const guestId = randomUUID();
    const email = `guest-${guestId}@guest.heydoctor.local`;

    const patient = this.patientsRepo.create({
      name: dto.name,
      email,
      clinicId,
    });
    await this.patientsRepo.save(patient);

    const consultation = this.consultationsRepo.create({
      patientId: patient.id,
      clinicId,
      doctorId,
      reason: dto.reason,
      status: ConsultationStatus.DRAFT,
      consentVersion: GUEST_CONSENT_MARKER,
      consentGivenAt: new Date(),
    });
    await this.consultationsRepo.save(consultation);

    const joinUrl = `${this.publicAppBaseUrl()}/teleconsulta/${consultation.id}`;

    this.logger.log(
      `[public-consultations] guest consultation created consultationId=${consultation.id} patientId=${patient.id} clinicId=${clinicId}`,
    );

    return {
      consultationId: consultation.id,
      joinUrl,
      patientId: patient.id,
    };
  }

  /**
   * Resuelve la clínica destino del paciente guest. Prefiere `GUEST_CLINIC_ID`
   * (configurada por operaciones); si no, usa la clínica más antigua. Si no
   * hay clínicas en BD, lanza 503.
   */
  private async resolveGuestClinicId(): Promise<string> {
    const fromEnv = process.env.GUEST_CLINIC_ID?.trim();
    if (fromEnv) return fromEnv;

    const first = await this.clinicsRepo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    if (!first) {
      throw new ServiceUnavailableException(
        'No hay clínica disponible para asignar la consulta guest. Configure GUEST_CLINIC_ID.',
      );
    }
    return first.id;
  }

  /**
   * El campo `doctorId` en la entidad Consultation es NOT NULL pero no es FK,
   * así que para el guest queue usamos el nil-UUID como marcador. Operaciones
   * puede sobreescribir con `GUEST_DOCTOR_ID` para asignación automática.
   */
  private resolveGuestDoctorId(): string {
    return process.env.GUEST_DOCTOR_ID?.trim() || NIL_DOCTOR_UUID;
  }

  /**
   * Información mínima de una consulta para gating del frontend en modo guest.
   * No expone PHI; solo permite saber si la consulta existe, su estado y si
   * fue creada por flujo guest.
   */
  async getStatus(id: string): Promise<PublicConsultationStatus> {
    const c = await this.consultationsRepo.findOne({
      where: { id },
      select: ['id', 'status', 'consentVersion'],
    });
    if (!c) {
      throw new NotFoundException('Consultation not found');
    }
    return {
      id: c.id,
      status: c.status,
      isGuest: c.consentVersion === GUEST_CONSENT_MARKER,
    };
  }

  private publicAppBaseUrl(): string {
    const fromEnv =
      process.env.PUBLIC_APP_URL?.trim() ||
      process.env.FRONTEND_URL?.trim() ||
      process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (fromEnv) return fromEnv.replace(/\/+$/, '');
    return 'https://heydoctor.health';
  }
}
