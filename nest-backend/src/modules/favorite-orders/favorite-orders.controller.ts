import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { FavoriteOrdersService } from './favorite-orders.service';
import { CreateFavoriteOrderDto } from './dto/create-favorite-order.dto';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('favorite-orders')
export class FavoriteOrdersController {
  constructor(private readonly service: FavoriteOrdersService) {}

  @Get()
  async findAll(
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
  ) {
    if (!clinicId || !userId) {
      return { data: [] };
    }
    return this.service.findAll(clinicId, userId);
  }

  @Post()
  async create(
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateFavoriteOrderDto,
  ) {
    if (!clinicId || !userId) {
      return { data: null };
    }
    return this.service.create(clinicId, userId, dto);
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
  ) {
    if (!clinicId || !userId) {
      return { data: null };
    }
    return this.service.delete(id, clinicId, userId);
  }
}
