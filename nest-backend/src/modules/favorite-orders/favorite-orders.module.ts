import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FavoriteOrder } from '../../entities';
import { FavoriteOrdersService } from './favorite-orders.service';
import { FavoriteOrdersController } from './favorite-orders.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FavoriteOrder])],
  controllers: [FavoriteOrdersController],
  providers: [FavoriteOrdersService],
  exports: [FavoriteOrdersService],
})
export class FavoriteOrdersModule {}
