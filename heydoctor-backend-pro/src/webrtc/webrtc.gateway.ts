import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/types/jwt-payload.interface';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ConsultationsService } from '../consultations/consultations.service';
import { RequirePlan } from '../subscriptions/decorators/require-plan.decorator';
import { FeatureGuard } from '../subscriptions/guards/feature.guard';
import { SubscriptionPlan } from '../subscriptions/subscription.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsersService } from '../users/users.service';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SignalingPayload = {
  consultationId: string;
};

type OfferAnswerPayload = SignalingPayload & {
  sdp: unknown;
};

type IceCandidatePayload = SignalingPayload & {
  candidate: unknown;
};

@SkipThrottle()
@WebSocketGateway({
  namespace: '/webrtc',
  cors: {
    origin: true,
    credentials: true,
  },
})
@UseGuards(FeatureGuard)
@RequirePlan(SubscriptionPlan.PRO)
export class WebrtcGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WebrtcGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly consultationsService: ConsultationsService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`WS disconnect: no token (${client.id})`);
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const user = await this.usersService.findById(payload.sub);
      if (
        !user ||
        user.email !== payload.email ||
        user.role !== payload.role
      ) {
        client.disconnect(true);
        return;
      }
      const authUser: AuthenticatedUser = {
        sub: user.id,
        email: user.email,
        role: user.role,
        clinicId: user.clinicId ?? null,
      };
      const canUseWebrtc = await this.subscriptionsService.hasRequiredPlan(
        authUser.sub,
        SubscriptionPlan.PRO,
      );
      if (!canUseWebrtc) {
        this.logger.warn(`WS disconnect: plan free (${client.id})`);
        client.disconnect(true);
        return;
      }
      (client.data as { user?: AuthenticatedUser }).user = authUser;
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const u = (client.data as { user?: AuthenticatedUser }).user;
    if (u) {
      this.logger.debug(`WS disconnect user=${u.sub} socket=${client.id}`);
    }
  }

  @SubscribeMessage('join-consultation')
  async joinConsultation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SignalingPayload,
  ): Promise<{ ok: true; consultationId: string }> {
    const user = this.requireUser(client);
    const consultationId = this.requireConsultationId(body?.consultationId);
    await this.consultationsService.verifySignalingAccess(consultationId, user);
    await client.join(consultationId);
    this.logger.debug(`User ${user.sub} joined room ${consultationId}`);
    client.to(consultationId).emit('peer-joined', { userId: user.sub });
    return { ok: true, consultationId };
  }

  @SubscribeMessage('offer')
  async relayOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: OfferAnswerPayload,
  ): Promise<void> {
    const user = this.requireUser(client);
    const consultationId = this.requireConsultationId(body?.consultationId);
    this.assertInRoom(client, consultationId);
    if (body?.sdp === undefined) {
      throw new WsException('sdp required');
    }
    client.to(consultationId).emit('offer', {
      sdp: body.sdp,
      fromUserId: user.sub,
    });
  }

  @SubscribeMessage('answer')
  async relayAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: OfferAnswerPayload,
  ): Promise<void> {
    const user = this.requireUser(client);
    const consultationId = this.requireConsultationId(body?.consultationId);
    this.assertInRoom(client, consultationId);
    if (body?.sdp === undefined) {
      throw new WsException('sdp required');
    }
    client.to(consultationId).emit('answer', {
      sdp: body.sdp,
      fromUserId: user.sub,
    });
  }

  @SubscribeMessage('ice-candidate')
  async relayIce(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: IceCandidatePayload,
  ): Promise<void> {
    const user = this.requireUser(client);
    const consultationId = this.requireConsultationId(body?.consultationId);
    this.assertInRoom(client, consultationId);
    if (body?.candidate === undefined) {
      throw new WsException('candidate required');
    }
    client.to(consultationId).emit('ice-candidate', {
      candidate: body.candidate,
      fromUserId: user.sub,
    });
  }

  @SubscribeMessage('leave')
  async leave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SignalingPayload,
  ): Promise<{ ok: true }> {
    const user = this.requireUser(client);
    const consultationId = this.requireConsultationId(body?.consultationId);
    await client.leave(consultationId);
    client.to(consultationId).emit('peer-left', { userId: user.sub });
    this.logger.debug(`User ${user.sub} left room ${consultationId}`);
    return { ok: true };
  }

  private requireUser(client: Socket): AuthenticatedUser {
    const user = (client.data as { user?: AuthenticatedUser }).user;
    if (!user) {
      throw new WsException('Unauthorized');
    }
    return user;
  }

  private requireConsultationId(id: unknown): string {
    if (typeof id !== 'string' || !UUID_V4.test(id)) {
      throw new WsException('Invalid consultationId');
    }
    return id;
  }

  private assertInRoom(client: Socket, consultationId: string): void {
    if (!client.rooms.has(consultationId)) {
      throw new WsException('Join the consultation room first');
    }
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token && typeof auth.token === 'string') {
      return auth.token;
    }
    const header = client.handshake.headers.authorization;
    if (
      typeof header === 'string' &&
      header.toLowerCase().startsWith('bearer ')
    ) {
      return header.slice(7).trim();
    }
    const q = client.handshake.query.token;
    if (typeof q === 'string' && q.length > 0) {
      return q;
    }
    if (Array.isArray(q) && typeof q[0] === 'string') {
      return q[0];
    }
    return null;
  }
}
