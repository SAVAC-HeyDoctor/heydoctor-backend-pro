import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PatientReminder, Patient } from '../../entities';

@Injectable()
export class PatientRemindersService {
  constructor(
    @InjectRepository(PatientReminder)
    private readonly reminderRepo: Repository<PatientReminder>,
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
  ) {}

  async findAll(clinicId: string, patientId?: string) {
    const qb = this.reminderRepo
      .createQueryBuilder('r')
      .leftJoin('r.patient', 'p')
      .where('p.clinicId = :clinicId', { clinicId });

    if (patientId) {
      qb.andWhere('r.patientId = :patientId', { patientId });
    }

    const items = await qb
      .orderBy('r.dueDate', 'ASC')
      .addOrderBy('r.createdAt', 'DESC')
      .getMany();

    return { data: items };
  }

  async create(
    clinicId: string,
    dto: { patientId: string; reminderType: string; dueDate: string; notes?: string },
  ) {
    const patient = await this.patientRepo.findOne({
      where: { id: dto.patientId, clinicId },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const reminder = this.reminderRepo.create({
      patientId: dto.patientId,
      reminderType: dto.reminderType,
      dueDate: new Date(dto.dueDate),
      notes: dto.notes,
    });
    const saved = await this.reminderRepo.save(reminder);
    return { data: saved };
  }

  async update(
    id: string,
    clinicId: string,
    dto: { reminderType?: string; dueDate?: string; status?: string; notes?: string },
  ) {
    const reminder = await this.reminderRepo
      .createQueryBuilder('r')
      .leftJoin('r.patient', 'p')
      .where('r.id = :id', { id })
      .andWhere('p.clinicId = :clinicId', { clinicId })
      .getOne();

    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    if (dto.reminderType) reminder.reminderType = dto.reminderType;
    if (dto.dueDate) reminder.dueDate = new Date(dto.dueDate);
    if (dto.status) reminder.status = dto.status;
    if (dto.notes !== undefined) reminder.notes = dto.notes;

    const saved = await this.reminderRepo.save(reminder);
    return { data: saved };
  }
}
