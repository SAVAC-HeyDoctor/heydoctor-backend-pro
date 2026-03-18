import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FavoriteOrder } from '../../entities';

@Injectable()
export class FavoriteOrdersService {
  constructor(
    @InjectRepository(FavoriteOrder)
    private readonly favoriteOrderRepo: Repository<FavoriteOrder>,
  ) {}

  async findAll(clinicId: string, userId: string) {
    const items = await this.favoriteOrderRepo.find({
      where: { clinicId, userId },
      order: { createdAt: 'DESC' },
    });
    return { data: items };
  }

  async create(
    clinicId: string,
    userId: string,
    dto: { name: string; type?: string; items?: Record<string, unknown> },
  ) {
    const order = this.favoriteOrderRepo.create({
      clinicId,
      userId,
      name: dto.name,
      type: dto.type || 'lab',
      items: dto.items,
    });
    const saved = await this.favoriteOrderRepo.save(order);
    return { data: saved };
  }

  async delete(id: string, clinicId: string, userId: string) {
    const result = await this.favoriteOrderRepo.delete({
      id,
      clinicId,
      userId,
    });
    if (result.affected === 0) {
      throw new NotFoundException('Favorite order not found');
    }
    return { data: { success: true } };
  }
}
