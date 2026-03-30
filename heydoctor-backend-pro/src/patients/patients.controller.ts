import { Body, Controller, Get, Logger, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreatePatientDto } from './dto/create-patient.dto';
import { PatientsService } from './patients.service';

@UseGuards(JwtAuthGuard)
@Controller('patients')
export class PatientsController {
  private readonly logger = new Logger(PatientsController.name);

  constructor(private readonly patientsService: PatientsService) {}

  /** Emits DEBUG in non-production, LOG in production (less noisy default levels). */
  private logRequest(message: string): void {
    if (process.env.NODE_ENV === 'production') {
      this.logger.log(message);
    } else {
      this.logger.debug(message);
    }
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() pagination: PaginationQueryDto,
  ) {
    this.logRequest(`findAll requested by user ${user.sub} (${user.email})`);
    return this.patientsService.findAll(user, pagination);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePatientDto,
  ) {
    this.logRequest(`create requested by user ${user.sub} (${user.email})`);
    return this.patientsService.create(dto, user);
  }
}
