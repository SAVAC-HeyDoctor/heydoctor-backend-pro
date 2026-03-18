import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClinicUser } from '../../entities/clinic-user.entity';

@Injectable()
export class ClinicResolverInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(ClinicUser)
    private readonly clinicUserRepo: Repository<ClinicUser>,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { userId?: string } | undefined;

    if (user?.userId) {
      try {
        const clinicUser = await this.clinicUserRepo.findOne({
          where: { userId: user.userId },
          order: { createdAt: 'ASC' },
        });
        if (clinicUser) {
          request.clinicId = clinicUser.clinicId;
        }
      } catch {
        // Ignore clinic resolution errors
      }
    }

    return next.handle();
  }
}
