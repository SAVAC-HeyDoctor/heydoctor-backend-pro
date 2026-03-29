import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TelemedicineConsent } from '../consents/consent.entity';
import { User } from '../users/user.entity';

/**
 * GDPR / Ley 19.628 data subject rights service.
 *
 * Phase 1 (current): export + soft-delete request.
 * Phase 2 (future): actual hard-delete with legal retention carve-outs,
 *                    consent withdrawal propagation, third-party data deletion
 *                    requests (Payku, Railway backups).
 *
 * HIPAA future: BAA tracking, breach notification automation, PHI audit trail.
 */
@Injectable()
export class GdprService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(TelemedicineConsent)
    private readonly consentsRepo: Repository<TelemedicineConsent>,
    private readonly auditService: AuditService,
  ) {}

  async exportUserData(userId: string): Promise<{
    user: { id: string; email: string; role: string; createdAt: Date };
    consents: Array<{ version: string; consentGivenAt: Date; createdAt: Date }>;
    exportedAt: string;
    format: string;
    notice: string;
  }> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const consents = await this.consentsRepo.find({
      where: { userId },
      select: ['version', 'consentGivenAt', 'createdAt'],
      order: { createdAt: 'DESC' },
    });

    void this.auditService.logSuccess({
      userId,
      action: 'GDPR_DATA_EXPORT',
      resource: 'user',
      resourceId: userId,
      httpStatus: 200,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
      consents: consents.map((c) => ({
        version: c.version,
        consentGivenAt: c.consentGivenAt,
        createdAt: c.createdAt,
      })),
      exportedAt: new Date().toISOString(),
      format: 'JSON (GDPR Art. 20 compliant)',
      notice:
        'Clinical records are retained per legal requirements (Chile DS 41/2012: 15 years). ' +
        'Contact dpo@heydoctor.cl for full data package including consultation records.',
    };
  }

  async requestDataDeletion(userId: string): Promise<{
    status: string;
    message: string;
    retentionNotice: string;
  }> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    void this.auditService.logSuccess({
      userId,
      action: 'GDPR_DELETION_REQUEST',
      resource: 'user',
      resourceId: userId,
      httpStatus: 200,
    });

    // Phase 2: implement actual anonymization/deletion pipeline
    return {
      status: 'received',
      message:
        'Su solicitud de eliminación ha sido registrada. ' +
        'Será procesada dentro de los 30 días hábiles conforme a la normativa aplicable.',
      retentionNotice:
        'Los registros clínicos se conservan por el plazo legal obligatorio (15 años). ' +
        'Los datos de auditoría se retienen de forma indefinida por trazabilidad legal.',
    };
  }
}
