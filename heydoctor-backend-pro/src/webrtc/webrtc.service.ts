import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ConsultationsService } from '../consultations/consultations.service';
import { RecordWebrtcMetricDto } from './dto/record-webrtc-metric.dto';
import { WebrtcMetricSample } from './entities/webrtc-metric-sample.entity';

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type WebrtcMetricsSummary = {
  consultationId: string;
  sampleCount: number;
  averages: {
    rttMs: number | null;
    packetLossRatio: number | null;
    outboundBitrateBps: number | null;
  };
  qualityAggregate: 'good' | 'weak' | 'poor' | 'insufficient_data';
  trends: Array<{
    recordedAt: string;
    rttMs: number | null;
    packetLossRatio: number | null;
    outboundBitrateBps: number | null;
    qualityPoint: 'good' | 'weak' | 'poor' | 'unknown';
  }>;
};

const TREND_LIMIT = 50;

const DEFAULT_STUN: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

@Injectable()
export class WebrtcService {
  private readonly logger = new Logger(WebrtcService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly consultationsService: ConsultationsService,
    @InjectRepository(WebrtcMetricSample)
    private readonly metricsRepository: Repository<WebrtcMetricSample>,
  ) {}

  /**
   * Returns STUN/TURN servers for a teleconsultation. Validates that the user
   * is allowed to access the consultation (same rule as signaling).
   */
  async getIceServers(
    consultationId: string,
    authUser: AuthenticatedUser,
  ): Promise<IceServer[]> {
    await this.consultationsService.verifySignalingAccess(
      consultationId,
      authUser,
    );

    const servers: IceServer[] = [];

    const stunUrls = this.parseCsv(this.configService.get('WEBRTC_STUN_URLS'));
    if (stunUrls.length > 0) {
      servers.push({ urls: stunUrls });
    } else {
      servers.push(...DEFAULT_STUN);
    }

    const turnUrls = this.parseCsv(this.configService.get('WEBRTC_TURN_URLS'));
    const turnUsername = this.configService
      .get<string>('WEBRTC_TURN_USERNAME')
      ?.trim();
    const turnCredential = this.configService
      .get<string>('WEBRTC_TURN_CREDENTIAL')
      ?.trim();

    if (turnUrls.length > 0 && turnUsername && turnCredential) {
      servers.push({
        urls: turnUrls,
        username: turnUsername,
        credential: turnCredential,
      });
    }

    return servers;
  }

  /**
   * Persists a single quality sample. Frontend posts here every few seconds
   * during a call; we keep a bounded history per consultation.
   */
  async recordMetric(
    dto: RecordWebrtcMetricDto,
    authUser: AuthenticatedUser,
  ): Promise<void> {
    await this.consultationsService.verifySignalingAccess(
      dto.consultationId,
      authUser,
    );

    const ratio =
      dto.packetLossRatio ?? this.deriveLossRatio(dto.packetsLost, dto.bitrate);

    const sample = this.metricsRepository.create({
      consultationId: dto.consultationId,
      reportedByUserId: authUser.sub,
      rttMs: dto.rtt ?? null,
      packetLossRatio: ratio,
      outboundBitrateBps: dto.bitrate ?? null,
      jitterMs: dto.jitter ?? null,
      packetsLost: dto.packetsLost ?? null,
    });

    await this.metricsRepository.save(sample);
  }

  async getMetricsSummary(
    consultationId: string,
    authUser: AuthenticatedUser,
  ): Promise<WebrtcMetricsSummary> {
    await this.consultationsService.verifySignalingAccess(
      consultationId,
      authUser,
    );

    const samples = await this.metricsRepository.find({
      where: { consultationId },
      order: { recordedAt: 'ASC' },
      take: TREND_LIMIT,
    });

    if (samples.length === 0) {
      return {
        consultationId,
        sampleCount: 0,
        averages: {
          rttMs: null,
          packetLossRatio: null,
          outboundBitrateBps: null,
        },
        qualityAggregate: 'insufficient_data',
        trends: [],
      };
    }

    const averages = {
      rttMs: this.average(samples.map((s) => s.rttMs)),
      packetLossRatio: this.average(samples.map((s) => s.packetLossRatio)),
      outboundBitrateBps: this.average(
        samples.map((s) => s.outboundBitrateBps),
      ),
    };

    const aggregate = this.classifyQuality(
      averages.rttMs,
      averages.packetLossRatio,
    );

    return {
      consultationId,
      sampleCount: samples.length,
      averages,
      qualityAggregate:
        aggregate === 'unknown' ? 'insufficient_data' : aggregate,
      trends: samples.map((s) => ({
        recordedAt: s.recordedAt.toISOString(),
        rttMs: s.rttMs,
        packetLossRatio: s.packetLossRatio,
        outboundBitrateBps: s.outboundBitrateBps,
        qualityPoint: this.classifyQuality(s.rttMs, s.packetLossRatio),
      })),
    };
  }

  private parseCsv(value: unknown): string[] {
    if (typeof value !== 'string') return [];
    return value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  }

  private deriveLossRatio(
    packetsLost: number | undefined,
    bitrateBps: number | undefined,
  ): number | null {
    if (packetsLost === undefined || bitrateBps === undefined) return null;
    if (bitrateBps <= 0) return null;
    const approxPacketsSent = bitrateBps / 8 / 1200;
    if (approxPacketsSent <= 0) return null;
    const ratio = packetsLost / (approxPacketsSent + packetsLost);
    return Math.max(0, Math.min(1, ratio));
  }

  private average(values: Array<number | null>): number | null {
    const present = values.filter((v): v is number => typeof v === 'number');
    if (present.length === 0) return null;
    const sum = present.reduce((acc, v) => acc + v, 0);
    return sum / present.length;
  }

  private classifyQuality(
    rttMs: number | null,
    lossRatio: number | null,
  ): 'good' | 'weak' | 'poor' | 'unknown' {
    if (rttMs === null && lossRatio === null) return 'unknown';
    const rtt = rttMs ?? 0;
    const loss = lossRatio ?? 0;
    if (rtt <= 150 && loss <= 0.02) return 'good';
    if (rtt <= 300 && loss <= 0.05) return 'weak';
    return 'poor';
  }
}
