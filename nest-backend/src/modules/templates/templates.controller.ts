import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { ClinicId } from '../../common/decorators/clinic-id.decorator';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly service: TemplatesService) {}

  @Get()
  async findAll(@ClinicId() clinicId: string) {
    if (!clinicId) {
      return { data: [] };
    }
    return this.service.findAll(clinicId);
  }

  @Post()
  async create(
    @ClinicId() clinicId: string,
    @Body() dto: CreateTemplateDto,
  ) {
    if (!clinicId) {
      return { data: null };
    }
    return this.service.create(clinicId, dto);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @ClinicId() clinicId: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    if (!clinicId) {
      return { data: null };
    }
    return this.service.update(id, clinicId, dto);
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @ClinicId() clinicId: string,
  ) {
    if (!clinicId) {
      return { data: null };
    }
    return this.service.delete(id, clinicId);
  }
}
