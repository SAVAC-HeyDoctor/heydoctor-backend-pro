import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { DoctorProfilesService } from './doctor-profiles.service';
import { CreateRatingDto } from './dto/create-rating.dto';

@Public()
@Controller('doctors')
export class DoctorProfilesController {
  constructor(private readonly service: DoctorProfilesService) {}

  @Get()
  findAll() {
    return this.service.findAllPublic();
  }

  @Get(':slug')
  findBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  @Get(':slug/ratings')
  getRatings(@Param('slug') slug: string) {
    return this.service.findBySlug(slug).then((p) =>
      this.service.getRatings(p.id),
    );
  }

  @Post(':slug/ratings')
  addRating(
    @Param('slug') slug: string,
    @Body() dto: CreateRatingDto,
  ) {
    return this.service.addRating(slug, dto);
  }
}
