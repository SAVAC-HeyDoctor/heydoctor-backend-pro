import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ConsultationsModule } from '../consultations/consultations.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsersModule } from '../users/users.module';
import { WebrtcMetricSample } from './entities/webrtc-metric-sample.entity';
import { WebrtcController } from './webrtc.controller';
import { WebrtcGateway } from './webrtc.gateway';
import { WebrtcService } from './webrtc.service';

/**
 * WebRTC signaling over Socket.IO (no media). For horizontal scale, attach a
 * Redis adapter to the Socket.IO server (see OUTPUT / Nest + socket.io-redis).
 *
 * Also exposes the HTTP companion endpoints (ICE servers + quality metrics)
 * required by the frontend teleconsultation flow.
 */
@Module({
  imports: [
    ConfigModule,
    AuthModule,
    UsersModule,
    ConsultationsModule,
    SubscriptionsModule,
    TypeOrmModule.forFeature([WebrtcMetricSample]),
  ],
  controllers: [WebrtcController],
  providers: [WebrtcGateway, WebrtcService],
})
export class WebrtcModule {}
