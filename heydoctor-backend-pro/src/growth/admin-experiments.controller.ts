import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { ExperimentsService } from './experiments.service';
import { CreateExperimentDto, PatchExperimentDto } from './dto/growth.dto';

@Controller('admin/experiments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminExperimentsController {
  constructor(private readonly experiments: ExperimentsService) {}

  @Get()
  list() {
    return this.experiments.list();
  }

  @Post()
  create(@Body() dto: CreateExperimentDto) {
    return this.experiments.create(dto);
  }

  @Patch(':key')
  patch(@Param('key') key: string, @Body() dto: PatchExperimentDto) {
    return this.experiments.patchByKey(key, dto);
  }
}
