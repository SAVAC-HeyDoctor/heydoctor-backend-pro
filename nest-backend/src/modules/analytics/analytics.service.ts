import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Doctor, ClinicUser } from '../../entities';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Doctor)
    private readonly doctorRepo: Repository<Doctor>,
    @InjectRepository(ClinicUser)
    private readonly clinicUserRepo: Repository<ClinicUser>,
  ) {}

  async getDoctorAdoption(clinicId: string, days: number = 30) {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const clinicUsers = await this.clinicUserRepo.find({
      where: { clinicId },
      relations: ['user'],
    });

    const userIds = clinicUsers.map((cu) => cu.userId);
    const doctors =
      userIds.length > 0
        ? await this.doctorRepo.find({
            where: { clinicId, userId: In(userIds) },
            relations: ['user'],
          })
        : [];

    // Mock adoption metrics - in production would aggregate from usage logs
    const adoption = doctors.map((d) => ({
      doctorId: d.id,
      doctorName: d.user
        ? `${d.user.firstName || ''} ${d.user.lastName || ''}`.trim()
        : 'Unknown',
      speciality: d.speciality,
      totalConsultations: Math.floor(Math.random() * 50) + 10,
      aiFeaturesUsed: Math.floor(Math.random() * 30) + 5,
      adoptionScore: Math.floor(Math.random() * 40) + 60,
    }));

    return {
      data: {
        period: { days, from: fromDate.toISOString() },
        adoption,
      },
    };
  }
}
