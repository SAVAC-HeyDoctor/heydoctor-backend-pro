import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prescription, Medication } from '../../entities';

@Injectable()
export class PrescriptionsService {
  constructor(
    @InjectRepository(Prescription)
    private readonly prescriptionRepo: Repository<Prescription>,
    @InjectRepository(Medication)
    private readonly medicationRepo: Repository<Medication>,
  ) {}

  async create(
    clinicId: string,
    doctorId: string,
    dto: {
      patientId: string;
      medications: Array<{
        name: string;
        dosage?: string;
        frequency?: string;
        duration?: string;
        instructions?: string;
      }>;
      notes?: string;
    },
  ) {
    const prescription = this.prescriptionRepo.create({
      clinicId,
      doctorId,
      patientId: dto.patientId,
      medications: dto.medications,
      notes: dto.notes,
    });
    const saved = await this.prescriptionRepo.save(prescription);
    return { data: saved };
  }

  async getByPatient(patientId: string, clinicId: string) {
    const prescriptions = await this.prescriptionRepo.find({
      where: { patientId, clinicId },
      order: { createdAt: 'DESC' },
    });
    return { data: prescriptions };
  }

  async suggestMedications(query: string) {
    if (!query || query.length < 2) {
      const meds = await this.medicationRepo.find({ take: 15 });
      return { data: meds.map((m) => m.name) };
    }

    const medications = await this.medicationRepo
      .createQueryBuilder('m')
      .where('m.name ILIKE :q OR m.genericName ILIKE :q', {
        q: `%${query}%`,
      })
      .take(20)
      .getMany();

    return { data: medications.map((m) => m.name) };
  }
}
