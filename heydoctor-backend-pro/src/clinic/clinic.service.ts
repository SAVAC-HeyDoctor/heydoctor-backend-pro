import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Clinic } from './clinic.entity';

@Injectable()
export class ClinicService {
  constructor(
    @InjectRepository(Clinic)
    private readonly clinicsRepository: Repository<Clinic>,
  ) {}

  async createClinic(name: string): Promise<Clinic> {
    const trimmed = name.trim().slice(0, 200);
    const entity = this.clinicsRepository.create({
      name: trimmed.length > 0 ? trimmed : 'Default Clinic',
    });
    return this.clinicsRepository.save(entity);
  }

  async findById(id: string): Promise<Clinic | null> {
    return this.clinicsRepository.findOne({ where: { id } });
  }

  /** Clínica más antigua (misma semántica que migraciones de backfill). */
  async getOldestClinicId(): Promise<string | null> {
    const row = await this.clinicsRepository.find({
      order: { createdAt: 'ASC' },
      take: 1,
      select: { id: true },
    });
    return row[0]?.id ?? null;
  }
}
