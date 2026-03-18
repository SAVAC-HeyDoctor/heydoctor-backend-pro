import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { LabOrdersService } from './lab-orders.service';
import { CreateLabOrderDto } from './dto/create-lab-order.dto';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Doctor } from '../../entities';

@Controller('lab-orders')
export class LabOrdersController {
  constructor(
    private readonly labOrdersService: LabOrdersService,
    @InjectRepository(Doctor)
    private readonly doctorRepo: Repository<Doctor>,
  ) {}

  @Post()
  async create(
    @ClinicId() clinicId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateLabOrderDto,
  ) {
    const doctor = await this.doctorRepo.findOne({
      where: { userId, clinicId },
    });
    if (!doctor || !clinicId) {
      return { data: null };
    }
    return this.labOrdersService.create(clinicId, doctor.id, dto);
  }

  @Get('patient/:id')
  async getByPatient(
    @Param('id') patientId: string,
    @ClinicId() clinicId: string,
  ) {
    if (!clinicId) {
      return { data: [] };
    }
    return this.labOrdersService.getByPatient(patientId, clinicId);
  }

  @Get('suggest-tests')
  async suggestTests(@Query('q') q: string) {
    return this.labOrdersService.suggestTests(q || '');
  }
}
