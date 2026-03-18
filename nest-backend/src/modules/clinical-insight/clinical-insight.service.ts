import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Patient,
  ClinicalRecord,
  LabOrder,
  Prescription,
  Appointment,
} from '../../entities';

@Injectable()
export class ClinicalInsightService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    @InjectRepository(ClinicalRecord)
    private readonly clinicalRecordRepo: Repository<ClinicalRecord>,
    @InjectRepository(LabOrder)
    private readonly labOrderRepo: Repository<LabOrder>,
    @InjectRepository(Prescription)
    private readonly prescriptionRepo: Repository<Prescription>,
    @InjectRepository(Appointment)
    private readonly appointmentRepo: Repository<Appointment>,
  ) {}

  async getPatientInsight(patientId: string, clinicId: string) {
    const patient = await this.patientRepo.findOne({
      where: { id: patientId, clinicId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const [records, labOrders, prescriptions, appointments] = await Promise.all([
      this.clinicalRecordRepo.find({
        where: { patientId, clinicId },
        relations: ['diagnostics', 'treatments'],
        order: { consultationDate: 'DESC' },
        take: 10,
      }),
      this.labOrderRepo.find({
        where: { patientId, clinicId },
        order: { createdAt: 'DESC' },
        take: 5,
      }),
      this.prescriptionRepo.find({
        where: { patientId, clinicId },
        order: { createdAt: 'DESC' },
        take: 5,
      }),
      this.appointmentRepo.find({
        where: { patientId, clinicId },
        order: { scheduledAt: 'DESC' },
        take: 5,
      }),
    ]);

    return {
      data: {
        patient,
        recentRecords: records,
        recentLabOrders: labOrders,
        recentPrescriptions: prescriptions,
        upcomingAppointments: appointments,
      },
    };
  }
}
