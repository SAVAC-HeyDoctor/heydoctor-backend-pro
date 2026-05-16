import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export const ICE_CONNECTION_STATES = [
  'new',
  'checking',
  'connected',
  'completed',
  'failed',
  'disconnected',
  'closed',
] as const;

export const PEER_CONNECTION_STATES = [
  'new',
  'connecting',
  'connected',
  'disconnected',
  'failed',
  'closed',
] as const;

export const SIGNALING_STATES = [
  'stable',
  'have-local-offer',
  'have-remote-offer',
  'have-local-pranswer',
  'have-remote-pranswer',
  'closed',
] as const;

/**
 * Body accepted by `POST /api/webrtc/metrics`. All quality fields are optional
 * because some browsers don't expose every stat. We keep the shape aligned with
 * `lib/send-webrtc-metrics.ts` on the frontend.
 */
export class RecordWebrtcMetricDto {
  @IsUUID('4')
  consultationId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60_000)
  rtt?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  packetsLost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  bitrate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60_000)
  jitter?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  packetLossRatio?: number;

  @IsOptional()
  @IsString()
  @IsIn(ICE_CONNECTION_STATES)
  iceConnectionState?: (typeof ICE_CONNECTION_STATES)[number];

  @IsOptional()
  @IsString()
  @IsIn(PEER_CONNECTION_STATES)
  connectionState?: (typeof PEER_CONNECTION_STATES)[number];

  @IsOptional()
  @IsString()
  @IsIn(SIGNALING_STATES)
  signalingState?: (typeof SIGNALING_STATES)[number];
}
