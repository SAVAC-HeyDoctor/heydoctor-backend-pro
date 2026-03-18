import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient, Doctor, Cie10Code } from '../../entities';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Patient, Doctor, Cie10Code]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
