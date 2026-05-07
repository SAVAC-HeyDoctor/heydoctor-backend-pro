import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { FeatureFlagsService } from './feature-flags.service';
import { CreateFeatureFlagDto, PatchFeatureFlagDto } from './dto/growth.dto';

@Controller('admin/feature-flags')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminFeatureFlagsController {
  constructor(private readonly featureFlags: FeatureFlagsService) {}

  @Get()
  list() {
    return this.featureFlags.list();
  }

  @Post()
  create(@Body() dto: CreateFeatureFlagDto) {
    return this.featureFlags.create(dto);
  }

  @Patch(':key')
  patch(@Param('key') key: string, @Body() dto: PatchFeatureFlagDto) {
    return this.featureFlags.patchByKey(key, dto);
  }
}
