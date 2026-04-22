import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { Consultation } from '../consultations/consultation.entity';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [
    AuthModule,
    SubscriptionsModule,
    TypeOrmModule.forFeature([Consultation]),
    AuthorizationModule,
  ],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
