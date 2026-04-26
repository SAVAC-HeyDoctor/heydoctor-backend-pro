import { IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

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
}
