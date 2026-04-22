import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AuthorizationService } from '../authorization/authorization.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { User } from './user.entity';
import { UserRole } from './user-role.enum';
import { UsersService } from './users.service';

export type UserResponse = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  clinicId: string;
  isActive: boolean;
  createdAt: Date;
};

/** Respuesta POST /users (sin datos sensibles). */
export type CreateUserResponse = {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};

function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    role: user.role,
    clinicId: user.clinicId,
    isActive: user.isActive !== false,
    createdAt: user.createdAt,
  };
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async createUser(
    @Body() dto: CreateUserDto,
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<CreateUserResponse> {
    const { clinicId } =
      await this.authorizationService.getUserWithClinic(authUser);

    const user = await this.usersService.createUserForClinic(clinicId, {
      email: dto.email,
      password: dto.password,
      role: dto.role ?? UserRole.DOCTOR,
    });

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive !== false,
    };
  }

  private async assertSelfOrAdminSameClinic(
    authUser: AuthenticatedUser,
    targetUserId: string,
  ): Promise<void> {
    if (authUser.sub === targetUserId) {
      return;
    }
    if (authUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only update your own profile');
    }
    const [actor, target] = await Promise.all([
      this.usersService.findById(authUser.sub),
      this.usersService.findById(targetUserId),
    ]);
    if (!actor || !target) {
      throw new NotFoundException();
    }
    if (actor.clinicId !== target.clinicId) {
      throw new ForbiddenException('User is not in your clinic');
    }
  }

  private async assertAdminSameClinic(
    authUser: AuthenticatedUser,
    targetUserId: string,
  ): Promise<void> {
    if (authUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Insufficient permissions');
    }
    const [actor, target] = await Promise.all([
      this.usersService.findById(authUser.sub),
      this.usersService.findById(targetUserId),
    ]);
    if (!actor || !target) {
      throw new NotFoundException();
    }
    if (actor.clinicId !== target.clinicId) {
      throw new ForbiddenException('User is not in your clinic');
    }
  }

  @Patch(':id')
  async updateUser(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<UserResponse> {
    await this.assertSelfOrAdminSameClinic(authUser, id);
    const updated = await this.usersService.updateUser(id, dto);
    return toUserResponse(updated);
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateUserRole(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<UserResponse> {
    await this.assertAdminSameClinic(authUser, id);
    const updated = await this.usersService.updateUserRole(id, dto.role);
    return toUserResponse(updated);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateUserStatus(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() authUser: AuthenticatedUser,
  ): Promise<UserResponse> {
    await this.assertAdminSameClinic(authUser, id);
    if (dto.isActive === false && authUser.sub === id) {
      throw new BadRequestException('Cannot deactivate your own account');
    }
    const updated = await this.usersService.updateUserStatus(id, dto.isActive);
    return toUserResponse(updated);
  }
}
