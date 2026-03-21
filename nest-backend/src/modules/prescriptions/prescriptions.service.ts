import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prescription, Medication } from '../../entities';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { UpdatePrescriptionDto } from './dto/update-prescription.dto';
import { PrescriptionFiltersDto } from './dto/prescription-filters.dto';

@Injectable()
export class PrescriptionsService {
  constructor(
    @InjectRepository(Prescription)
    private readonly prescriptionRepo: Repository<Prescription>,
    @InjectRepository(Medication)
    private readonly medicationRepo: Repository<Medication>,
  ) {}

  async findAll(
    filters?: PrescriptionFiltersDto,
  ): Promise<{ data: Prescription[]; total: number }> {
    const qb = this.prescriptionRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.patient', 'patient')
      .leftJoinAndSelect('p.doctor', 'doctor')
      .leftJoinAndSelect('p.clinic', 'clinic')
      .leftJoinAndSelect('p.consultation', 'consultation')
      .leftJoinAndSelect('p.diagnosis', 'diagnosis');

    if (filters?.patientId) {
      qb.andWhere('p.patientId = :patientId', {
        patientId: filters.patientId,
      });
    }
    if (filters?.doctorId) {
      qb.andWhere('p.doctorId = :doctorId', { doctorId: filters.doctorId });
    }
    if (filters?.clinicId) {
      qb.andWhere('p.clinicId = :clinicId', { clinicId: filters.clinicId });
    }
    if (filters?.consultationId) {
      qb.andWhere('p.consultationId = :consultationId', {
        consultationId: filters.consultationId,
      });
    }
    if (filters?.diagnosisId) {
      qb.andWhere('p.diagnosisId = :diagnosisId', {
        diagnosisId: filters.diagnosisId,
      });
    }

    const [items, total] = await qb
      .orderBy('p.createdAt', 'DESC')
      .skip(filters?.offset ?? 0)
      .take(filters?.limit ?? 20)
      .getManyAndCount();

    return { data: items, total };
  }

  async findOne(id: string): Promise<{ data: Prescription }> {
    const prescription = await this.prescriptionRepo.findOne({
      where: { id },
      relations: [
        'patient',
        'doctor',
        'clinic',
        'consultation',
        'diagnosis',
      ],
    });
    if (!prescription) {
      throw new NotFoundException(`Prescription with id ${id} not found`);
    }
    return { data: prescription };
  }

  async create(
    clinicId: string,
    doctorId: string,
    dto: CreatePrescriptionDto,
  ) {
    const prescription = this.prescriptionRepo.create({
      clinicId: dto.clinicId ?? clinicId,
      doctorId: dto.doctorId ?? doctorId,
      patientId: dto.patientId,
      consultationId: dto.consultationId,
      diagnosisId: dto.diagnosisId,
      medications: dto.medications ?? [],
      dosage: dto.dosage,
      instructions: dto.instructions,
      notes: dto.notes,
    });
    const saved = await this.prescriptionRepo.save(prescription);
    return { data: saved };
  }

  async update(
    id: string,
    dto: UpdatePrescriptionDto,
  ): Promise<{ data: Prescription }> {
    const prescription = await this.prescriptionRepo.findOne({ where: { id } });
    if (!prescription) {
      throw new NotFoundException(`Prescription with id ${id} not found`);
    }
    Object.assign(prescription, dto);
    const saved = await this.prescriptionRepo.save(prescription);
    return { data: saved };
  }

  async remove(id: string): Promise<{ data: Prescription }> {
    const prescription = await this.prescriptionRepo.findOne({ where: { id } });
    if (!prescription) {
      throw new NotFoundException(`Prescription with id ${id} not found`);
    }
    await this.prescriptionRepo.remove(prescription);
    return { data: prescription };
  }

  async getByPatient(patientId: string, clinicId: string) {
    const prescriptions = await this.prescriptionRepo.find({
      where: { patientId, clinicId },
      relations: ['consultation', 'diagnosis'],
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
