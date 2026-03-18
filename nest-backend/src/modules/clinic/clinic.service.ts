import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Clinic,
  Patient,
  Appointment,
  ClinicalRecord,
  ClinicUser,
} from '../../entities';
import { PatientFiltersDto } from './dto/patient-filters.dto';
import { AppointmentFiltersDto } from './dto/appointment-filters.dto';

@Injectable()
export class ClinicService {
  constructor(
    @InjectRepository(Clinic)
    private readonly clinicRepo: Repository<Clinic>,
    @InjectRepository(ClinicUser)
    private readonly clinicUserRepo: Repository<ClinicUser>,
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
    @InjectRepository(ClinicalRecord)
    private readonly clinicalRecordRepo: Repository<ClinicalRecord>,
  ) {}

  async getClinicForUser(userId: string) {
    const clinicUser = await this.clinicUserRepo.findOne({
      where: { userId },
      relations: ['clinic'],
    });
    if (!clinicUser?.clinic) {
      throw new NotFoundException('Clinic not found for user');
    }
    return clinicUser.clinic;
  }

  async getPatients(clinicId: string, filters: PatientFiltersDto) {
    const qb = this.patientRepo
      .createQueryBuilder('p')
      .where('p.clinicId = :clinicId', { clinicId });

    if (filters.search) {
      qb.andWhere(
        '(p.firstName ILIKE :search OR p.lastName ILIKE :search OR p.email ILIKE :search OR p.documentNumber ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    const [items, total] = await qb
      .orderBy('p.lastName', 'ASC')
      .addOrderBy('p.firstName', 'ASC')
      .skip(filters.offset ?? 0)
      .take(filters.limit ?? 20)
      .getManyAndCount();

    return { data: items, total };
  }

  async getAppointments(clinicId: string, filters: AppointmentFiltersDto) {
    const qb = this.appointmentRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.patient', 'patient')
      .leftJoinAndSelect('a.doctor', 'doctor')
      .leftJoinAndSelect('doctor.user', 'user')
      .where('a.clinicId = :clinicId', { clinicId });

    if (filters.patientId) {
      qb.andWhere('a.patientId = :patientId', { patientId: filters.patientId });
    }
    if (filters.doctorId) {
      qb.andWhere('a.doctorId = :doctorId', { doctorId: filters.doctorId });
    }
    if (filters.status) {
      qb.andWhere('a.status = :status', { status: filters.status });
    }
    if (filters.from) {
      qb.andWhere('a.scheduledAt >= :from', { from: filters.from });
    }
    if (filters.to) {
      qb.andWhere('a.scheduledAt <= :to', { to: filters.to });
    }

    const [items, total] = await qb
      .orderBy('a.scheduledAt', 'DESC')
      .skip(filters.offset ?? 0)
      .take(filters.limit ?? 20)
      .getManyAndCount();

    return { data: items, total };
  }

  async getPatientMedicalRecord(patientId: string, clinicId: string) {
    const patient = await this.patientRepo.findOne({
      where: { id: patientId, clinicId },
      relations: ['clinicalRecords', 'clinicalRecords.diagnostics', 'clinicalRecords.treatments', 'clinicalRecords.doctor', 'clinicalRecords.doctor.user'],
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const records = await this.clinicalRecordRepo.find({
      where: { patientId, clinicId },
      relations: ['diagnostics', 'treatments', 'doctor', 'doctor.user'],
      order: { consultationDate: 'DESC' },
    });

    return {
      data: {
        patient,
        clinicalRecords: records,
      },
    };
  }
}
