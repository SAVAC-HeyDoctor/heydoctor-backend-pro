import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Consultation } from '../../entities';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { UpdateConsultationDto } from './dto/update-consultation.dto';
import { ConsultationFiltersDto } from './dto/consultation-filters.dto';

@Injectable()
export class ConsultationsService {
  constructor(
    @InjectRepository(Consultation)
    private readonly consultationRepo: Repository<Consultation>,
  ) {}

  async findAll(
    filters?: ConsultationFiltersDto,
  ): Promise<{ data: Consultation[]; total: number }> {
    const qb = this.consultationRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.patient', 'patient')
      .leftJoinAndSelect('c.doctor', 'doctor')
      .leftJoinAndSelect('c.clinic', 'clinic')
      .leftJoinAndSelect('c.clinical_record', 'clinical_record')
      .leftJoinAndSelect('c.diagnostic', 'diagnostic')
      .leftJoinAndSelect('c.lab_orders', 'lab_orders')
      .leftJoinAndSelect('c.prescriptions', 'prescriptions');

    if (filters?.patientId) {
      qb.andWhere('c.patientId = :patientId', { patientId: filters.patientId });
    }
    if (filters?.doctorId) {
      qb.andWhere('c.doctorId = :doctorId', { doctorId: filters.doctorId });
    }
    if (filters?.clinicId) {
      qb.andWhere('c.clinicId = :clinicId', { clinicId: filters.clinicId });
    }
    if (filters?.status) {
      qb.andWhere('c.status = :status', { status: filters.status });
    }
    if (filters?.from) {
      qb.andWhere('c.date >= :from', { from: filters.from });
    }
    if (filters?.to) {
      qb.andWhere('c.date <= :to', { to: filters.to });
    }

    const [items, total] = await qb
      .orderBy('c.date', 'DESC')
      .skip(filters?.offset ?? 0)
      .take(filters?.limit ?? 20)
      .getManyAndCount();

    return { data: items, total };
  }

  async findOne(id: string): Promise<{ data: Consultation }> {
    const consultation = await this.consultationRepo.findOne({
      where: { id },
      relations: [
        'patient',
        'doctor',
        'clinic',
        'clinical_record',
        'diagnostic',
        'lab_orders',
        'prescriptions',
      ],
    });
    if (!consultation) {
      throw new NotFoundException(`Consultation with id ${id} not found`);
    }
    return { data: consultation };
  }

  async create(dto: CreateConsultationDto): Promise<{ data: Consultation }> {
    const consultation = this.consultationRepo.create({
      ...dto,
      date: new Date(dto.date),
      duration: dto.duration ?? 45,
      status: dto.status ?? 'scheduled',
      confirmed: dto.confirmed ?? false,
      active: dto.active ?? true,
    });
    const saved = await this.consultationRepo.save(consultation);
    return { data: saved };
  }

  async update(
    id: string,
    dto: UpdateConsultationDto,
  ): Promise<{ data: Consultation }> {
    const consultation = await this.consultationRepo.findOne({ where: { id } });
    if (!consultation) {
      throw new NotFoundException(`Consultation with id ${id} not found`);
    }
    Object.assign(consultation, dto);
    if (dto.date) {
      consultation.date = new Date(dto.date);
    }
    const saved = await this.consultationRepo.save(consultation);
    return { data: saved };
  }

  async remove(id: string): Promise<{ data: Consultation }> {
    const consultation = await this.consultationRepo.findOne({ where: { id } });
    if (!consultation) {
      throw new NotFoundException(`Consultation with id ${id} not found`);
    }
    await this.consultationRepo.remove(consultation);
    return { data: consultation };
  }
}
