import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ApplicationStatus } from './doctor-application.entity';
import { DoctorApplicationsService } from './doctor-applications.service';
import { CreateDoctorApplicationDto } from './dto/create-application.dto';
import { ReviewApplicationDto } from './dto/review-application.dto';

@Controller('doctor-applications')
export class DoctorApplicationsController {
  constructor(private readonly service: DoctorApplicationsService) {}

  @Public()
  @Post()
  create(@Body() dto: CreateDoctorApplicationDto) {
    return this.service.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll(@Query('status') status?: ApplicationStatus) {
    return this.service.findAll(status);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  findOne(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  review(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ReviewApplicationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.review(id, dto, user);
  }
}
