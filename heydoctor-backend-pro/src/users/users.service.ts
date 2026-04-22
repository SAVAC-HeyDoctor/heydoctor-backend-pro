import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  type LoggerService,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtUserCacheInvalidationService } from '../auth/jwt-user-cache-invalidation.service';
import { ClinicService } from '../clinic/clinic.service';
import { assignClinic } from '../common/entity-clinic.util';
import { APP_LOGGER } from '../common/logger/logger.tokens';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './user.entity';
import { UserRole } from './user-role.enum';

const BCRYPT_ROUNDS = 12;
/** Rounds for admin/testing user creation (POST /users). */
const BCRYPT_ROUNDS_ADMIN_CREATE = 10;

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
    @Inject(APP_LOGGER)
    private readonly logger: LoggerService,
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

  /** Email único por clínica (multi-tenant). */
  async findByEmailAndClinic(
    email: string,
    clinicId: string,
  ): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    return this.usersRepository.findOne({
      where: {
        email: normalized,
        clinic: { id: clinicId },
      },
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
   * Cambio de contraseña autenticado: verifica la actual con bcrypt y persiste `password_hash`.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) {
      throw new NotFoundException();
    }
    if (!user.passwordHash || user.isActive === false) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) {
      throw new UnauthorizedException('Invalid credentials');
    }

    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.usersRepository.save(user);
    await this.invalidateJwtUserCache(userId);
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
      this.logger.warn('Business rule violation', {
        reason: 'email already registered',
        clinicId: existing.clinicId,
        existingUserId: existing.id,
      });
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
    });
    assignClinic(entity, clinic.id);
    const saved = await this.usersRepository.save(entity);
    const user = await this.findById(saved.id);
    if (!user) {
      throw new Error('Failed to load user after create');
    }
    return user;
  }

  /**
   * Crea usuario en una clínica existente (admin / Fase 4). Email único por clínica.
   */
  async createUserForClinic(
    clinicId: string,
    params: {
      email: string;
      password: string;
      role: UserRole;
    },
  ): Promise<User> {
    const normalized = params.email.trim().toLowerCase();
    const existing = await this.findByEmailAndClinic(normalized, clinicId);
    if (existing) {
      this.logger.warn('Business rule violation', {
        reason: 'email already exists in clinic',
        clinicId,
        existingUserId: existing.id,
      });
      throw new ConflictException('Email is already registered in this clinic');
    }

    const passwordHash = await bcrypt.hash(
      params.password,
      BCRYPT_ROUNDS_ADMIN_CREATE,
    );

    const entity = this.usersRepository.create({
      email: normalized,
      passwordHash,
      role: params.role,
      isActive: true,
    });
    assignClinic(entity, clinicId);
    const saved = await this.usersRepository.save(entity);
    const user = await this.findById(saved.id);
    if (!user) {
      throw new Error('Failed to load user after create');
    }

    this.logger.log('User created', {
      userId: user.id,
      clinicId,
      role: user.role,
    });
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
      const existing = await this.findByEmailAndClinic(normalized, user.clinicId);
      if (existing && existing.id !== userId) {
        this.logger.warn('Business rule violation', {
          reason: 'email already in use in clinic',
          clinicId: user.clinicId,
          conflictingUserId: existing.id,
        });
        throw new ConflictException('Email is already in use');
      }
      user.email = normalized;
    }

    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      user.name = trimmed.length > 0 ? trimmed : null;
    }

    const fields: string[] = [];
    if (dto.email !== undefined) fields.push('email');
    if (dto.name !== undefined) fields.push('name');

    await this.usersRepository.save(user);
    await this.invalidateJwtUserCache(user.id);

    this.logger.log('User updated', {
      userId: user.id,
      clinicId: user.clinicId,
      fields,
    });
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

    this.logger.log('User updated', {
      userId: user.id,
      clinicId: user.clinicId,
      isActive,
    });
    return user;
  }
}
