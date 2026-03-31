import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtUserCacheInvalidationService } from '../auth/jwt-user-cache-invalidation.service';
import { ClinicService } from '../clinic/clinic.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './user.entity';
import { UserRole } from './user-role.enum';

const BCRYPT_ROUNDS = 12;

/** Clinic name for new registrations: use email (capped) per multi-tenant phase 1. */
function clinicNameForNewUser(email: string): string {
  const trimmed = email.trim();
  return trimmed.length <= 200 ? trimmed : trimmed.slice(0, 200);
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly clinicService: ClinicService,
    private readonly jwtUserCacheInvalidation: JwtUserCacheInvalidationService,
  ) {}

  /**
   * Call after persisting JWT-claim fields (email, role, account active state) so guards see DB truth immediately.
   */
  async invalidateJwtUserCache(userId: string): Promise<void> {
    await this.jwtUserCacheInvalidation.invalidateUserCache(userId);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  /** Fast check for JWT validation when serving from cache. */
  async isUserActive(id: string): Promise<boolean> {
    const row = await this.usersRepository.findOne({
      where: { id },
      select: { id: true, isActive: true },
    });
    return row?.isActive !== false;
  }

  /**
   * Loads user including password hash (for credential checks only).
   */
  private async findByEmailWithPasswordHash(
    email: string,
  ): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: email.toLowerCase() })
      .getOne();
  }

  async validateCredentials(
    email: string,
    plainPassword: string,
  ): Promise<User | null> {
    const user = await this.findByEmailWithPasswordHash(email);
    if (!user?.passwordHash) {
      return null;
    }
    if (user.isActive === false) {
      return null;
    }
    const match = await bcrypt.compare(plainPassword, user.passwordHash);
    return match ? user : null;
  }

  /**
   * Creates a clinic, then a user with bcrypt-hashed password. Default role: doctor.
   */
  async create(
    email: string,
    plainPassword: string,
    role: UserRole = UserRole.DOCTOR,
  ): Promise<User> {
    const normalized = email.toLowerCase();
    const existing = await this.findByEmail(normalized);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const clinic = await this.clinicService.createClinic(
      clinicNameForNewUser(normalized),
    );

    const passwordHash = await bcrypt.hash(plainPassword, BCRYPT_ROUNDS);
    const entity = this.usersRepository.create({
      email: normalized,
      passwordHash,
      role,
      clinic,
    });
    const saved = await this.usersRepository.save(entity);
    const user = await this.findById(saved.id);
    if (!user) {
      throw new Error('Failed to load user after create');
    }
    return user;
  }

  async updateUser(userId: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException();
    }

    if (dto.email === undefined && dto.name === undefined) {
      throw new BadRequestException('Provide at least one field to update');
    }

    if (dto.email !== undefined) {
      const normalized = dto.email.trim().toLowerCase();
      const existing = await this.findByEmail(normalized);
      if (existing && existing.id !== userId) {
        throw new ConflictException('Email is already in use');
      }
      user.email = normalized;
    }

    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      user.name = trimmed.length > 0 ? trimmed : null;
    }

    await this.usersRepository.save(user);
    await this.invalidateJwtUserCache(user.id);
    return user;
  }

  async updateUserRole(userId: string, role: UserRole): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException();
    }

    user.role = role;
    await this.usersRepository.save(user);
    await this.invalidateJwtUserCache(user.id);
    return user;
  }

  async updateUserStatus(userId: string, isActive: boolean): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException();
    }

    user.isActive = isActive;
    await this.usersRepository.save(user);
    await this.invalidateJwtUserCache(user.id);
    return user;
  }
}
