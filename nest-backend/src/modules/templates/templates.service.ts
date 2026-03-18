import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Template } from '../../entities';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
  ) {}

  async findAll(clinicId: string) {
    const items = await this.templateRepo.find({
      where: { clinicId },
      order: { name: 'ASC' },
    });
    return { data: items };
  }

  async create(
    clinicId: string,
    dto: { name: string; content?: string; type?: string },
  ) {
    const template = this.templateRepo.create({
      clinicId,
      ...dto,
    });
    const saved = await this.templateRepo.save(template);
    return { data: saved };
  }

  async update(
    id: string,
    clinicId: string,
    dto: { name?: string; content?: string; type?: string },
  ) {
    const template = await this.templateRepo.findOne({
      where: { id, clinicId },
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    Object.assign(template, dto);
    const saved = await this.templateRepo.save(template);
    return { data: saved };
  }

  async delete(id: string, clinicId: string) {
    const result = await this.templateRepo.delete({ id, clinicId });
    if (result.affected === 0) {
      throw new NotFoundException('Template not found');
    }
    return { data: { success: true } };
  }
}
