import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/user-role.enum';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  /** Sin JWT: enlace mágico para el paciente. */
  @Public()
  @Get('confirm/:token')
  @HttpCode(HttpStatus.OK)
  confirm(@Param('token') token: string) {
    return this.appointmentsService.confirmByToken(token);
  }

  /** Sin JWT: enlace mágico para el paciente. */
  @Public()
  @Get('cancel/:token')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('token') token: string) {
    return this.appointmentsService.cancelByToken(token);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.ADMIN)
  create(
    @Body() dto: CreateAppointmentDto,
    @CurrentUser() authUser: AuthenticatedUser,
  ) {
    return this.appointmentsService.create(dto, authUser);
  }
}
