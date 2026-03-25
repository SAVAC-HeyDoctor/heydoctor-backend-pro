import { Controller, Get, StreamableFile, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UserRole } from '../users/user-role.enum';
import { LegalService } from './legal.service';

@Controller('legal')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  @Get('export')
  async export(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StreamableFile> {
    const { csv, rowCount } =
      await this.legalService.exportLegalConsultationsCsv(user);
    const filename = `legal-consultations-${new Date().toISOString().slice(0, 10)}-${rowCount}rows.csv`;
    return new StreamableFile(Buffer.from(csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
