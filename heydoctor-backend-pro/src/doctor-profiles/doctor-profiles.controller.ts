import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { DoctorProfilesService } from './doctor-profiles.service';
import { CreateRatingDto } from './dto/create-rating.dto';

@Controller('doctors')
export class DoctorProfilesController {
  constructor(private readonly service: DoctorProfilesService) {}

  @Public()
  @Get()
  findAll() {
    return this.service.findAllPublic();
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  @Public()
  @Get(':slug/ratings')
  getRatings(@Param('slug') slug: string) {
    return this.service
      .findBySlug(slug)
      .then((p) => this.service.getRatings(p.id));
  }

  @Post(':slug/ratings')
  @UseGuards(JwtAuthGuard)
  addRating(
    @Param('slug') slug: string,
    @Body() dto: CreateRatingDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.addRating(slug, dto, user);
  }
}
