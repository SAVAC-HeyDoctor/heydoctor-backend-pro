import { Controller, Delete, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { GdprService } from './gdpr.service';

/**
 * GDPR / Ley 19.628 — Endpoints de portabilidad y supresión de datos.
 *
 * Future-ready: skeleton implementado para cumplir GDPR Art. 17 (right to erasure)
 * y Art. 20 (data portability). Se completará cuando el volumen de usuarios lo requiera.
 *
 * HIPAA note: estos endpoints son compatibles con el derecho de acceso a PHI bajo HIPAA.
 * La implementación completa de HIPAA (encryption at rest, BAAs, breach notification)
 * se realizará como proyecto dedicado.
 */
@Controller('gdpr')
@UseGuards(JwtAuthGuard)
export class GdprController {
  constructor(private readonly gdprService: GdprService) {}

  /**
   * GDPR Art. 20 — Data portability / Ley 19.628 — Derecho de acceso.
   * Retorna todos los datos personales del usuario en formato estructurado.
   */
  @Get('export')
  async exportMyData(@CurrentUser() user: AuthenticatedUser) {
    return this.gdprService.exportUserData(user.sub);
  }

  /**
   * GDPR Art. 17 — Right to erasure / Ley 19.628 — Derecho de cancelación.
   * Inicia el proceso de eliminación de datos (con retención legal obligatoria).
   */
  @Delete('delete-my-data')
  async requestDeletion(@CurrentUser() user: AuthenticatedUser) {
    return this.gdprService.requestDataDeletion(user.sub);
  }
}
