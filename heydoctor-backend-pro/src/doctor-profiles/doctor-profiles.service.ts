import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AuthorizationService } from '../authorization/authorization.service';
import { Consultation } from '../consultations/consultation.entity';
import { assignClinic } from '../common/entity-clinic.util';
import { DoctorProfile } from './doctor-profile.entity';
import { DoctorRating } from './doctor-rating.entity';
import { CreateRatingDto } from './dto/create-rating.dto';

@Injectable()
export class DoctorProfilesService {
  constructor(
    @InjectRepository(DoctorProfile)
    private readonly profileRepo: Repository<DoctorProfile>,
    @InjectRepository(DoctorRating)
    private readonly ratingRepo: Repository<DoctorRating>,
    @InjectRepository(Consultation)
    private readonly consultationsRepository: Repository<Consultation>,
    @Inject(forwardRef(() => AuthorizationService))
    private readonly authorizationService: AuthorizationService,
  ) {}

  async findAllPublic(): Promise<DoctorProfile[]> {
    return this.profileRepo.find({
      where: { isPublic: true },
      order: { rating: 'DESC', name: 'ASC' },
    });
  }

  async findBySlug(slug: string): Promise<DoctorProfile> {
    const profile = await this.profileRepo.findOne({
      where: { slug, isPublic: true },
    });
    if (!profile) throw new NotFoundException('Doctor not found');
    return profile;
  }

  async findById(id: string): Promise<DoctorProfile | null> {
    return this.profileRepo.findOne({ where: { id } });
  }

  async findByUserId(userId: string): Promise<DoctorProfile | null> {
    return this.profileRepo.findOne({ where: { userId } });
  }

  async getRatings(
    doctorProfileId: string,
  ): Promise<{ ratings: DoctorRating[]; average: number; count: number }> {
    const ratings = await this.ratingRepo.find({
      where: { doctorProfileId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const count = ratings.length;
    const average =
      count > 0 ? ratings.reduce((s, r) => s + r.rating, 0) / count : 0;
    return { ratings, average, count };
  }

  async addRating(
    slug: string,
    dto: CreateRatingDto,
    authUser: AuthenticatedUser,
  ): Promise<DoctorRating> {
    const { clinicId, user } =
      await this.authorizationService.getUserWithClinic(authUser);
    const profile = await this.findBySlug(slug);

    const consultation = await this.consultationsRepository.findOne({
      where: { id: dto.consultationId },
      relations: { patient: true },
    });
    if (!consultation) {
      throw new ForbiddenException('Cannot rate this consultation');
    }
    if (consultation.clinicId !== clinicId) {
      throw new ForbiddenException('Cannot rate this consultation');
    }
    await this.authorizationService.assertUserInClinic(
      authUser,
      consultation.clinicId,
      user,
    );
    if (consultation.doctorId !== profile.userId) {
      throw new ForbiddenException('Cannot rate this consultation');
    }
    const patientEmail = consultation.patient?.email?.trim().toLowerCase();
    const userEmail = authUser.email?.trim().toLowerCase();
    if (!patientEmail || !userEmail || patientEmail !== userEmail) {
      throw new ForbiddenException('Cannot rate this consultation');
    }

    const entity = this.ratingRepo.create({
      doctorProfileId: profile.id,
      patientName: dto.patientName,
      rating: dto.rating,
      comment: dto.comment ?? '',
      consultationId: dto.consultationId,
    });
    assignClinic(entity, profile.clinicId);
    const saved = await this.ratingRepo.save(entity);

    const { avg } = await this.ratingRepo
      .createQueryBuilder('r')
      .select('AVG(r.rating)', 'avg')
      .where('r.doctor_profile_id = :id', { id: profile.id })
      .getRawOne();

    const totalCount = await this.ratingRepo.count({
      where: { doctorProfileId: profile.id },
    });

    profile.rating = Number(avg) || 0;
    profile.ratingCount = totalCount;
    await this.profileRepo.save(profile);

    return saved;
  }

  async createProfile(
    authUser: AuthenticatedUser,
    data: Omit<Partial<DoctorProfile>, 'clinic' | 'clinicId'>,
  ): Promise<DoctorProfile> {
    const { clinicId } =
      await this.authorizationService.getUserWithClinic(authUser);
    const entity = this.profileRepo.create(data);
    assignClinic(entity, clinicId);
    return this.profileRepo.save(entity);
  }
}
