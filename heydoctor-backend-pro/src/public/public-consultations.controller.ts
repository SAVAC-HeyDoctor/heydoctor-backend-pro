import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { CreateGuestConsultationDto } from './dto/create-guest-consultation.dto';
import {
  CreateGuestConsultationResult,
  PublicConsultationStatus,
  PublicConsultationsService,
} from './public-consultations.service';

/**
 * Endpoints públicos sin autenticación ni CSRF (el `CsrfGuard` salta el prefijo
 * `/api/public/` vía `CSRF_SKIP_PATH_PREFIXES`). Throttling agresivo a nivel de
 * IP para mitigar spam masivo de creación de pacientes guest.
 */
@Controller('public/consultations')
export class PublicConsultationsController {
  constructor(private readonly service: PublicConsultationsService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateGuestConsultationDto,
  ): Promise<CreateGuestConsultationResult> {
    return this.service.create(dto);
  }

  /**
   * Status mínimo (sin PHI) de una consulta para que el frontend permita la
   * entrada del paciente guest a `/teleconsulta/:id` sin sesión.
   */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':id/status')
  async getStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<PublicConsultationStatus> {
    return this.service.getStatus(id);
  }
}
