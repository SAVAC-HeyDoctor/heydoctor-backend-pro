import {
  Injectable,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClinicUser } from '../../entities/clinic-user.entity';
import { IS_PUBLIC_KEY } from '../../modules/auth/decorators/public.decorator';

@Injectable()
export class ClinicResolverGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(ClinicUser)
    private readonly clinicUserRepo: Repository<ClinicUser>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { userId?: string } | undefined;

    if (!user?.userId) {
      return true;
    }

    const clinicUser = await this.clinicUserRepo.findOne({
      where: { userId: user.userId },
      order: { createdAt: 'ASC' },
    });

    if (clinicUser) {
      request.clinicId = clinicUser.clinicId;
    }

    return true;
  }
}

