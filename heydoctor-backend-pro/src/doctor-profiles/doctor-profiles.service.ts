import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ): Promise<DoctorRating> {
    const profile = await this.findBySlug(slug);

    const entity = this.ratingRepo.create({
      doctorProfileId: profile.id,
      clinicId: profile.clinicId,
      patientName: dto.patientName,
      rating: dto.rating,
      comment: dto.comment ?? '',
      consultationId: dto.consultationId ?? null,
    });
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

  async createProfile(data: Partial<DoctorProfile>): Promise<DoctorProfile> {
    const entity = this.profileRepo.create(data);
    return this.profileRepo.save(entity);
  }
}
