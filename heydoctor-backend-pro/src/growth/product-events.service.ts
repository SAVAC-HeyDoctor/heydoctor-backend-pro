import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductEvent } from './product-event.entity';

@Injectable()
export class ProductEventsService {
  constructor(
    @InjectRepository(ProductEvent)
    private readonly repo: Repository<ProductEvent>,
  ) {}

  async track(
    userId: string | null | undefined,
    eventName: string,
    properties?: Record<string, unknown> | null,
  ): Promise<void> {
    const row = this.repo.create({
      userId: userId ?? null,
      eventName,
      properties:
        properties && Object.keys(properties).length ? properties : {},
    });
    await this.repo.save(row);
  }
}
