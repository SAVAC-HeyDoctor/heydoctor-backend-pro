import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AuthorizationService } from '../authorization/authorization.service';
import { AuditService } from '../audit/audit.service';
import { AiService } from '../ai/ai.service';
import { ClinicService } from '../clinic/clinic.service';
import { APP_LOGGER } from '../common/logger/logger.tokens';
import { ConsentService } from '../consents/consent.service';
import { Consultation } from '../consultations/consultation.entity';
import { ConsultationsService } from '../consultations/consultations.service';
import {
  ApplicationStatus,
  DoctorApplication,
} from '../doctor-applications/doctor-application.entity';
import { DoctorApplicationsService } from '../doctor-applications/doctor-applications.service';
import { DoctorProfilesService } from '../doctor-profiles/doctor-profiles.service';
import { DoctorProfile } from '../doctor-profiles/doctor-profile.entity';
import { DoctorRating } from '../doctor-profiles/doctor-rating.entity';
import { CreateRatingDto } from '../doctor-profiles/dto/create-rating.dto';
import { ProductEventsService } from '../growth/product-events.service';
import { Patient } from '../patients/patient.entity';
import { PatientsService } from '../patients/patients.service';
import { createTestingModuleWithMocks } from '../test-utils/create-testing-module';
import { UserRole } from '../users/user-role.enum';

describe('Multi-tenant IDOR guards (unit)', () => {
  const userA: AuthenticatedUser = {
    sub: 'user-a',
    email: 'a@clinic.test',
    role: UserRole.DOCTOR,
    clinicId: 'clinic-a',
  };

  describe('DoctorApplicationsService', () => {
    let service: DoctorApplicationsService;
    let repo: { findOne: jest.Mock; find: jest.Mock; save: jest.Mock };
    let authz: { getUserWithClinic: jest.Mock };

    beforeEach(async () => {
      repo = {
        findOne: jest.fn(),
        find: jest.fn(),
        save: jest.fn(),
      };
      authz = {
        getUserWithClinic: jest
          .fn()
          .mockResolvedValue({ clinicId: 'clinic-a', user: {} }),
      };
      const module: TestingModule = await createTestingModuleWithMocks({
        subjects: [DoctorApplicationsService],
        providers: [
          DoctorApplicationsService,
          { provide: getRepositoryToken(DoctorApplication), useValue: repo },
          { provide: AuthorizationService, useValue: authz },
          AuditService,
          ClinicService,
        ],
      });
      service = module.get(DoctorApplicationsService);
    });

    it('findOne queries by id and clinicId from getUserWithClinic', async () => {
      repo.findOne.mockResolvedValue({
        id: 'app-1',
        clinicId: 'clinic-a',
        status: ApplicationStatus.PENDING,
      });
      await service.findOne('app-1', userA);
      expect(authz.getUserWithClinic).toHaveBeenCalledWith(userA);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 'app-1', clinicId: 'clinic-a' },
      });
    });

    it('findOne throws NotFound when application belongs to another clinic', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.findOne('foreign-app', userA),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('findAll filters by clinicId', async () => {
      repo.find.mockResolvedValue([]);
      await service.findAll(userA, ApplicationStatus.PENDING);
      expect(repo.find).toHaveBeenCalledWith({
        where: { clinicId: 'clinic-a', status: ApplicationStatus.PENDING },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('ConsultationsService.findOne', () => {
    let service: ConsultationsService;
    let consultationsRepo: { findOne: jest.Mock };
    let authz: {
      getUserWithClinic: jest.Mock;
      assertUserInClinic: jest.Mock;
    };
    let doctorProfiles: { findByUserId: jest.Mock };

    beforeEach(async () => {
      consultationsRepo = { findOne: jest.fn() };
      authz = {
        getUserWithClinic: jest
          .fn()
          .mockResolvedValue({ clinicId: 'clinic-a', user: {} }),
        assertUserInClinic: jest.fn().mockResolvedValue(undefined),
      };
      doctorProfiles = {
        findByUserId: jest.fn().mockResolvedValue({
          id: 'profile-a',
          userId: 'user-a',
          clinicId: 'clinic-a',
        }),
      };
      const module: TestingModule = await createTestingModuleWithMocks({
        subjects: [ConsultationsService],
        providers: [
          ConsultationsService,
          {
            provide: getRepositoryToken(Consultation),
            useValue: consultationsRepo,
          },
          { provide: AuthorizationService, useValue: authz },
          ConsentService,
          { provide: DoctorProfilesService, useValue: doctorProfiles },
          AuditService,
          AiService,
          ConfigService,
          ProductEventsService,
          {
            provide: APP_LOGGER,
            useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
          },
        ],
      });
      service = module.get(ConsultationsService);
    });

    it('loads consultation by id and clinicId only', async () => {
      const row = {
        id: 'c1',
        clinicId: 'clinic-a',
        patient: {},
      };
      consultationsRepo.findOne.mockResolvedValue(row);
      await service.findOne('c1', userA);
      expect(consultationsRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'c1', clinicId: 'clinic-a' },
        relations: { patient: true },
      });
    });

    it('returns 404 when consultation is in another clinic (repo miss)', async () => {
      consultationsRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('c-other', userA)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lists doctor consultations with clinic and doctor filters', async () => {
      const findAllForClinic = jest
        .spyOn(service, 'findAllForClinic')
        .mockResolvedValue({ data: [], total: 0 });

      await service.findAll(userA);

      expect(doctorProfiles.findByUserId).toHaveBeenCalledWith('user-a');
      expect(findAllForClinic).toHaveBeenCalledWith(
        'clinic-a',
        expect.any(Object),
        { restrictToDoctorId: 'user-a' },
      );
    });

    it('fails closed when doctor profile lookup fails', async () => {
      doctorProfiles.findByUserId.mockRejectedValue(new Error('db timeout'));
      const findAllForClinic = jest.spyOn(service, 'findAllForClinic');

      await expect(service.findAll(userA)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      expect(findAllForClinic).not.toHaveBeenCalled();
    });

    it('fails closed when doctor profile is missing', async () => {
      doctorProfiles.findByUserId.mockResolvedValue(null);
      const findAllForClinic = jest.spyOn(service, 'findAllForClinic');

      await expect(service.findAll(userA)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(findAllForClinic).not.toHaveBeenCalled();
    });
  });

  describe('PatientsService.findAll', () => {
    let service: PatientsService;
    let patientsRepo: { find: jest.Mock; findAndCount: jest.Mock };
    let authz: { getUserWithClinic: jest.Mock };

    beforeEach(async () => {
      patientsRepo = {
        find: jest.fn().mockResolvedValue([]),
        findAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      authz = {
        getUserWithClinic: jest
          .fn()
          .mockResolvedValue({ clinicId: 'clinic-a', user: {} }),
      };
      const module: TestingModule = await createTestingModuleWithMocks({
        subjects: [PatientsService],
        providers: [
          PatientsService,
          { provide: getRepositoryToken(Patient), useValue: patientsRepo },
          { provide: AuthorizationService, useValue: authz },
          AuditService,
          {
            provide: APP_LOGGER,
            useValue: { log: jest.fn(), warn: jest.fn() },
          },
        ],
      });
      service = module.get(PatientsService);
    });

    it('lists patients only for user clinic', async () => {
      await service.findAll(userA);
      expect(patientsRepo.find).toHaveBeenCalledWith({
        where: { clinicId: 'clinic-a' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('DoctorProfilesService.addRating', () => {
    let service: DoctorProfilesService;
    let profileRepo: {
      findOne: jest.Mock;
      save: jest.Mock;
    };
    let ratingRepo: {
      create: jest.Mock;
      save: jest.Mock;
      createQueryBuilder: jest.Mock;
      count: jest.Mock;
    };
    let consultationsRepo: { findOne: jest.Mock };
    let authz: {
      getUserWithClinic: jest.Mock;
      assertUserInClinic: jest.Mock;
    };

    beforeEach(async () => {
      profileRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'prof-1',
          userId: 'doc-b',
          clinicId: 'clinic-b',
          slug: 'dr-b',
          rating: 0,
          ratingCount: 0,
        }),
        save: jest.fn().mockImplementation(async (p) => p),
      };
      ratingRepo = {
        create: jest.fn((x) => x),
        save: jest.fn().mockImplementation(async (x) => x),
        createQueryBuilder: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ avg: '4' }),
        }),
        count: jest.fn().mockResolvedValue(1),
      };
      consultationsRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'cons-1',
          clinicId: 'clinic-b',
          doctorId: 'doc-b',
          patient: { email: 'a@clinic.test' },
        }),
      };
      authz = {
        getUserWithClinic: jest
          .fn()
          .mockResolvedValue({ clinicId: 'clinic-a', user: {} }),
        assertUserInClinic: jest.fn().mockResolvedValue(undefined),
      };
      const module: TestingModule = await createTestingModuleWithMocks({
        subjects: [DoctorProfilesService],
        providers: [
          DoctorProfilesService,
          { provide: getRepositoryToken(DoctorProfile), useValue: profileRepo },
          { provide: getRepositoryToken(DoctorRating), useValue: ratingRepo },
          {
            provide: getRepositoryToken(Consultation),
            useValue: consultationsRepo,
          },
          { provide: AuthorizationService, useValue: authz },
        ],
      });
      service = module.get(DoctorProfilesService);
    });

    it('rejects when consultation clinic differs from user clinic', async () => {
      const dto: CreateRatingDto = {
        patientName: 'Pat',
        rating: 5,
        consultationId: 'cons-1',
      };
      await expect(
        service.addRating('dr-b', dto, userA),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
