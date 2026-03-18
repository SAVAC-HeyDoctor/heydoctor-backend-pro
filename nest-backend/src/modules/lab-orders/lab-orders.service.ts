import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LabOrder, Patient, Medication } from '../../entities';

@Injectable()
export class LabOrdersService {
  constructor(
    @InjectRepository(LabOrder)
    private readonly labOrderRepo: Repository<LabOrder>,
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
    @InjectRepository(Medication)
    private readonly medicationRepo: Repository<Medication>,
  ) {}

  async create(
    clinicId: string,
    doctorId: string,
    dto: { patientId: string; tests: string[]; notes?: string },
  ) {
    const order = this.labOrderRepo.create({
      clinicId,
      doctorId,
      patientId: dto.patientId,
      tests: dto.tests,
      notes: dto.notes,
    });
    const saved = await this.labOrderRepo.save(order);
    return { data: saved };
  }

  async getByPatient(patientId: string, clinicId: string) {
    const orders = await this.labOrderRepo.find({
      where: { patientId, clinicId },
      order: { createdAt: 'DESC' },
    });
    return { data: orders };
  }

  async suggestTests(query: string) {
    // Mock/common lab tests - in production could use a lab tests catalog
    const commonTests = [
      'Hemograma completo',
      'Glucosa en ayunas',
      'Perfil lipídico',
      'Creatinina',
      'Urea',
      'TSH',
      'T4 libre',
      'PCR',
      'Ferritina',
      'Vitamina D',
      'HbA1c',
      'Orina completa',
      'Coprocultivo',
    ];

    if (!query || query.length < 2) {
      return { data: commonTests.slice(0, 10) };
    }

    const q = query.toLowerCase();
    const filtered = commonTests.filter((t) => t.toLowerCase().includes(q));
    return { data: filtered.length > 0 ? filtered : commonTests.slice(0, 5) };
  }
}
