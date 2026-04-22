import {
  Controller,
  Get,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/user-role.enum';
import { formatAuditLogsAsCsv } from './audit-export-csv';
import { AuditService } from './audit.service';
import { AuditExportQueryDto } from './dto/audit-export-query.dto';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('export')
  async export(@Query() query: AuditExportQueryDto): Promise<StreamableFile> {
    const rows = await this.auditService.findLogsForExport({
      clinicId: query.clinicId,
      action: query.action,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
    const csv = formatAuditLogsAsCsv(rows);
    const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    return new StreamableFile(Buffer.from(csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
