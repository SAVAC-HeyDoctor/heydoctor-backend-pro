import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Telemetry sample stored when the frontend reports WebRTC stats during a
 * teleconsultation. No SDP / no media is persisted — only quality numbers used
 * to compute call quality summaries.
 */
@Entity({ name: 'webrtc_metric_samples' })
@Index('IDX_webrtc_metric_samples_consultation_recorded', [
  'consultationId',
  'recordedAt',
])
export class WebrtcMetricSample {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'consultation_id', type: 'uuid' })
  consultationId!: string;

  @Column({ name: 'reported_by_user_id', type: 'uuid' })
  reportedByUserId!: string;

  @Column({
    name: 'rtt_ms',
    type: 'double precision',
    nullable: true,
  })
  rttMs!: number | null;

  @Column({
    name: 'packet_loss_ratio',
    type: 'double precision',
    nullable: true,
  })
  packetLossRatio!: number | null;

  @Column({
    name: 'outbound_bitrate_bps',
    type: 'double precision',
    nullable: true,
  })
  outboundBitrateBps!: number | null;

  @Column({ name: 'jitter_ms', type: 'double precision', nullable: true })
  jitterMs!: number | null;

  @Column({ name: 'packets_lost', type: 'integer', nullable: true })
  packetsLost!: number | null;

  @Column({
    name: 'ice_connection_state',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  iceConnectionState!: string | null;

  @Column({
    name: 'connection_state',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  connectionState!: string | null;

  @Column({
    name: 'signaling_state',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  signalingState!: string | null;

  @Column({
    name: 'event_type',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  eventType!: string | null;

  @Column({ name: 'event_count', type: 'integer', nullable: true })
  eventCount!: number | null;

  @CreateDateColumn({ name: 'recorded_at', type: 'timestamp with time zone' })
  recordedAt!: Date;
}
