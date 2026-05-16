import { Logger } from '@nestjs/common';
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
import { ACCESS_TOKEN_COOKIE } from '../auth/auth-cookies';
import { corsOrigin } from '../config/origin-allowlist';
import { ConsultationsService } from '../consultations/consultations.service';
import { SubscriptionPlan } from '../subscriptions/subscription.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { UsersService } from '../users/users.service';
import { ICE_CONNECTION_STATES } from './dto/record-webrtc-metric.dto';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SDP_BYTES = 128_000;
const MAX_ICE_CANDIDATE_BYTES = 16_000;

type SignalingPayload = {
  consultationId: string;
};

type OfferAnswerPayload = SignalingPayload & {
  sdp: unknown;
};

type IceCandidatePayload = SignalingPayload & {
  candidate: unknown;
};

type IceStatePayload = SignalingPayload & {
  state: unknown;
};

@SkipThrottle()
@WebSocketGateway({
  namespace: '/webrtc',
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
})
/**
 * No usar FeatureGuard / RequirePlan a nivel de gateway: en WS el guard puede
 * ejecutarse antes de que `handleConnection` asigne `client.data.user` → Forbidden sin ACK.
 * Plan PRO: validado en `handleConnection` (y aquí `requireUser` tras conectar).
 */
export class WebrtcGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WebrtcGateway.name);
  private readonly socketRooms = new Map<string, Set<string>>();
  private readonly roomParticipants = new Map<string, Map<string, number>>();

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
      if (!user || user.email !== payload.email || user.role !== payload.role) {
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
      this.cleanupSocketRooms(client, u.sub, 'disconnect');
    }
  }

  @SubscribeMessage('join-consultation')
  async joinConsultation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SignalingPayload,
  ): Promise<{ ok: true; consultationId: string }> {
    const user = this.requireUser(client);
    const planOk = await this.subscriptionsService.hasRequiredPlan(
      user.sub,
      SubscriptionPlan.PRO,
    );
    if (!planOk) {
      throw new WsException('PRO plan required for video calls');
    }
    const consultationId = this.requireConsultationId(body?.consultationId);
    this.logger.log(
      `join-consultation.start user=${user.sub} consultation=${consultationId}`,
    );
    try {
      await this.consultationsService.verifySignalingAccess(
        consultationId,
        user,
      );
      await client.join(consultationId);
      const roomState = this.trackJoin(client, user.sub, consultationId);
      this.logger.log(
        `join-consultation.joined user=${user.sub} consultation=${consultationId}`,
      );
      client.emit('room-state', {
        consultationId,
        peerCount: roomState.peerCount,
      });
      if (roomState.firstUserJoin) {
        client.to(consultationId).emit('peer-joined', { userId: user.sub });
      }
      return { ok: true, consultationId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `join-consultation.failed user=${user.sub} consultation=${consultationId}: ${msg}`,
      );
      throw err;
    }
  }

  @SubscribeMessage('offer')
  relayOffer(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: OfferAnswerPayload,
  ): void {
    const user = this.requireUser(client);
    const consultationId = this.requireConsultationId(body?.consultationId);
    this.assertInRoom(client, consultationId);
    if (body?.sdp === undefined) {
      throw new WsException('sdp required');
    }
    this.assertPayloadSize(body.sdp, 'sdp', MAX_SDP_BYTES);
    client.to(consultationId).emit('offer', {
      sdp: body.sdp,
      fromUserId: user.sub,
    });
  }

  @SubscribeMessage('answer')
  relayAnswer(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: OfferAnswerPayload,
  ): void {
    const user = this.requireUser(client);
    const consultationId = this.requireConsultationId(body?.consultationId);
    this.assertInRoom(client, consultationId);
    if (body?.sdp === undefined) {
      throw new WsException('sdp required');
    }
    this.assertPayloadSize(body.sdp, 'sdp', MAX_SDP_BYTES);
    client.to(consultationId).emit('answer', {
      sdp: body.sdp,
      fromUserId: user.sub,
    });
  }

  @SubscribeMessage('ice-candidate')
  relayIce(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: IceCandidatePayload,
  ): void {
    const user = this.requireUser(client);
    const consultationId = this.requireConsultationId(body?.consultationId);
    this.assertInRoom(client, consultationId);
    if (body?.candidate === undefined) {
      throw new WsException('candidate required');
    }
    this.assertPayloadSize(
      body.candidate,
      'candidate',
      MAX_ICE_CANDIDATE_BYTES,
    );
    client.to(consultationId).emit('ice-candidate', {
      candidate: body.candidate,
      fromUserId: user.sub,
    });
  }

  @SubscribeMessage('ice-state')
  recordIceState(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: IceStatePayload,
  ): { ok: true } {
    const user = this.requireUser(client);
    const consultationId = this.requireConsultationId(body?.consultationId);
    this.assertInRoom(client, consultationId);
    if (
      typeof body?.state !== 'string' ||
      !ICE_CONNECTION_STATES.includes(
        body.state as (typeof ICE_CONNECTION_STATES)[number],
      )
    ) {
      throw new WsException('Invalid ICE state');
    }
    const state = body.state;
    const level =
      state === 'failed' || state === 'disconnected' ? 'warn' : 'debug';
    this.logger[level]('webrtc_ice_state', {
      event: 'webrtc_ice_state',
      consultationId,
      userId: user.sub,
      state,
    });
    client.to(consultationId).emit('peer-ice-state', {
      fromUserId: user.sub,
      state,
    });
    return { ok: true };
  }

  @SubscribeMessage('leave')
  async leave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SignalingPayload,
  ): Promise<{ ok: true }> {
    const user = this.requireUser(client);
    const consultationId = this.requireConsultationId(body?.consultationId);
    await client.leave(consultationId);
    const roomState = this.trackLeave(client, user.sub, consultationId);
    if (roomState.lastUserLeave) {
      client.to(consultationId).emit('peer-left', { userId: user.sub });
    }
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

  private assertPayloadSize(
    value: unknown,
    field: string,
    maxBytes: number,
  ): void {
    let bytes = 0;
    try {
      bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
    } catch {
      throw new WsException(`Invalid ${field}`);
    }
    if (bytes > maxBytes) {
      throw new WsException(`${field} payload too large`);
    }
  }

  private trackJoin(
    client: Socket,
    userId: string,
    consultationId: string,
  ): { firstUserJoin: boolean; peerCount: number } {
    let rooms = this.socketRooms.get(client.id);
    if (!rooms) {
      rooms = new Set<string>();
      this.socketRooms.set(client.id, rooms);
    }
    if (rooms.has(consultationId)) {
      return {
        firstUserJoin: false,
        peerCount: this.countParticipants(consultationId),
      };
    }
    rooms.add(consultationId);

    let participants = this.roomParticipants.get(consultationId);
    if (!participants) {
      participants = new Map<string, number>();
      this.roomParticipants.set(consultationId, participants);
    }
    const previous = participants.get(userId) ?? 0;
    participants.set(userId, previous + 1);

    return {
      firstUserJoin: previous === 0,
      peerCount: participants.size,
    };
  }

  private trackLeave(
    client: Socket,
    userId: string,
    consultationId: string,
  ): { lastUserLeave: boolean; peerCount: number } {
    const rooms = this.socketRooms.get(client.id);
    if (!rooms?.has(consultationId)) {
      return {
        lastUserLeave: false,
        peerCount: this.countParticipants(consultationId),
      };
    }
    rooms.delete(consultationId);
    if (rooms.size === 0) {
      this.socketRooms.delete(client.id);
    }

    const participants = this.roomParticipants.get(consultationId);
    if (!participants) {
      return { lastUserLeave: false, peerCount: 0 };
    }
    const previous = participants.get(userId) ?? 0;
    if (previous <= 1) {
      participants.delete(userId);
    } else {
      participants.set(userId, previous - 1);
    }
    if (participants.size === 0) {
      this.roomParticipants.delete(consultationId);
    }
    return {
      lastUserLeave: previous <= 1,
      peerCount: participants.size,
    };
  }

  private cleanupSocketRooms(
    client: Socket,
    userId: string,
    reason: 'disconnect',
  ): void {
    const rooms = Array.from(this.socketRooms.get(client.id) ?? []);
    for (const consultationId of rooms) {
      const roomState = this.trackLeave(client, userId, consultationId);
      if (roomState.lastUserLeave) {
        this.server.to(consultationId).emit('peer-left', { userId, reason });
      }
    }
  }

  private countParticipants(consultationId: string): number {
    return this.roomParticipants.get(consultationId)?.size ?? 0;
  }

  private extractToken(client: Socket): string | null {
    const rawCookie = client.handshake.headers.cookie;
    if (typeof rawCookie === 'string' && rawCookie.length > 0) {
      const esc = ACCESS_TOKEN_COOKIE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = new RegExp(`(?:^|;\\s*)${esc}=([^;]*)`).exec(rawCookie);
      const rawVal = m?.[1]?.trim();
      if (rawVal) {
        try {
          return decodeURIComponent(rawVal);
        } catch {
          return rawVal;
        }
      }
    }
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
    if (process.env.NODE_ENV !== 'production') {
      const q = client.handshake.query.token;
      if (typeof q === 'string' && q.length > 0) {
        return q;
      }
      if (Array.isArray(q) && typeof q[0] === 'string') {
        return q[0];
      }
    }
    return null;
  }
}
