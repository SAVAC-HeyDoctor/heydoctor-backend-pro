'use client';

import {
  reportWebrtcFailure,
  reportWebrtcResilienceMetric,
  reportWebrtcState,
} from './webrtc-observability';

type MaybePromise<T> = T | Promise<T>;

export type WebrtcPeerId = string;

export type WebrtcResilienceManagerOptions = {
  consultationId: string;
  requestId?: string | null;
  mediaConstraints?: MediaStreamConstraints;
  stalePeerMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  onSendOffer: (
    peerId: WebrtcPeerId,
    description: RTCSessionDescriptionInit,
  ) => MaybePromise<void>;
  onReconnectAttempt?: (peerId: WebrtcPeerId, attempt: number) => void;
  onReconnectSuccess?: (peerId: WebrtcPeerId) => void;
  onLocalStreamRecovered?: (stream: MediaStream) => void;
};

type PeerRuntime = {
  peer: RTCPeerConnection;
  lastSeenAt: number;
  reconnectAttempts: number;
  iceRestartCount: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  staleTimer: ReturnType<typeof setInterval> | null;
  renegotiating: boolean;
  removeListeners: () => void;
};

const DEFAULT_STALE_PEER_MS = 45_000;
const DEFAULT_RECONNECT_BASE_MS = 1_000;
const DEFAULT_RECONNECT_MAX_MS = 15_000;

function jitter(ms: number): number {
  return Math.round(ms * (0.8 + Math.random() * 0.4));
}

function backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  const cappedAttempt = Math.max(0, Math.min(attempt, 8));
  return jitter(Math.min(maxMs, baseMs * 2 ** cappedAttempt));
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function replaceSenderTrack(
  peer: RTCPeerConnection,
  stream: MediaStream,
): void {
  for (const sender of peer.getSenders()) {
    const kind = sender.track?.kind;
    if (!kind) continue;
    const replacement = stream.getTracks().find((track) => track.kind === kind);
    if (replacement) {
      void sender.replaceTrack(replacement);
    }
  }
}

async function safePlay(element: HTMLMediaElement): Promise<void> {
  try {
    await element.play();
  } catch {
    // Safari/iOS may require a user gesture; callers can retry from a click/tap.
  }
}

export async function unlockWebrtcAutoplay(
  elements: Iterable<HTMLMediaElement>,
): Promise<void> {
  const audioContextClass =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (audioContextClass) {
    const audioContext = new audioContextClass();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    await audioContext.close();
  }

  await Promise.all(Array.from(elements, (element) => safePlay(element)));
}

export class WebrtcResilienceManager {
  private readonly peers = new Map<WebrtcPeerId, PeerRuntime>();
  private localStream: MediaStream | null = null;
  private pageVisibilityHandler: (() => void) | null = null;

  constructor(private readonly options: WebrtcResilienceManagerOptions) {}

  attachPeer(peerId: WebrtcPeerId, peer: RTCPeerConnection): void {
    const existing = this.peers.get(peerId);
    if (existing?.peer === peer) {
      existing.lastSeenAt = Date.now();
      return;
    }
    this.cleanupPeer(peerId);

    const onIceState = (): void => {
      const state = peer.iceConnectionState;
      this.markPeerSeen(peerId);
      reportWebrtcState('webrtc_ice_state', {
        consultationId: this.options.consultationId,
        requestId: this.options.requestId,
        state,
      });
      if (state === 'failed') {
        void this.restartIce(peerId, 'ice_failed');
      } else if (state === 'disconnected') {
        this.scheduleReconnect(peerId, 'ice_disconnected');
      }
    };

    const onConnectionState = (): void => {
      const state = peer.connectionState;
      this.markPeerSeen(peerId);
      reportWebrtcState('webrtc_connection_state', {
        consultationId: this.options.consultationId,
        requestId: this.options.requestId,
        state,
      });
      if (state === 'failed') {
        void this.restartIce(peerId, 'connection_failed');
      } else if (state === 'disconnected') {
        this.scheduleReconnect(peerId, 'connection_disconnected');
      } else if (state === 'connected') {
        void this.recordReconnectSuccess(peerId);
      }
    };

    const onSignalingState = (): void => {
      reportWebrtcState('webrtc_signaling_state', {
        consultationId: this.options.consultationId,
        requestId: this.options.requestId,
        state: peer.signalingState,
      });
    };

    peer.addEventListener('iceconnectionstatechange', onIceState);
    peer.addEventListener('connectionstatechange', onConnectionState);
    peer.addEventListener('signalingstatechange', onSignalingState);

    const staleTimer = setInterval(() => {
      const runtime = this.peers.get(peerId);
      if (!runtime) return;
      if (Date.now() - runtime.lastSeenAt >= this.stalePeerMs) {
        this.scheduleReconnect(peerId, 'stale_peer');
      }
    }, Math.min(this.stalePeerMs, 15_000));

    this.peers.set(peerId, {
      peer,
      lastSeenAt: Date.now(),
      reconnectAttempts: 0,
      iceRestartCount: 0,
      reconnectTimer: null,
      staleTimer,
      renegotiating: false,
      removeListeners: () => {
        peer.removeEventListener('iceconnectionstatechange', onIceState);
        peer.removeEventListener('connectionstatechange', onConnectionState);
        peer.removeEventListener('signalingstatechange', onSignalingState);
      },
    });
  }

  attachLocalStream(stream: MediaStream): void {
    if (this.localStream && this.localStream !== stream) {
      stopStream(this.localStream);
    }
    this.localStream = stream;
    for (const runtime of this.peers.values()) {
      replaceSenderTrack(runtime.peer, stream);
    }
  }

  markPeerSeen(peerId: WebrtcPeerId): void {
    const runtime = this.peers.get(peerId);
    if (runtime) {
      runtime.lastSeenAt = Date.now();
    }
  }

  async restartIce(peerId: WebrtcPeerId, reason: string): Promise<void> {
    const runtime = this.peers.get(peerId);
    if (!runtime || runtime.renegotiating) {
      return;
    }
    if (runtime.peer.signalingState !== 'stable') {
      this.scheduleReconnect(peerId, 'renegotiation_not_stable');
      return;
    }

    runtime.renegotiating = true;
    runtime.iceRestartCount += 1;
    await reportWebrtcResilienceMetric('ice_restart_count', {
      consultationId: this.options.consultationId,
      requestId: this.options.requestId,
      count: runtime.iceRestartCount,
      reason,
    });

    try {
      runtime.peer.restartIce?.();
      const offer = await runtime.peer.createOffer({ iceRestart: true });
      await runtime.peer.setLocalDescription(offer);
      await this.options.onSendOffer(peerId, offer);
      this.scheduleReconnect(peerId, reason);
    } catch (error) {
      reportWebrtcFailure('webrtc_reconnect_failed', error, {
        consultationId: this.options.consultationId,
        requestId: this.options.requestId,
        reason,
      });
      this.scheduleReconnect(peerId, 'ice_restart_failed');
    } finally {
      runtime.renegotiating = false;
    }
  }

  async recoverLocalMedia(reason: string): Promise<MediaStream | null> {
    if (!navigator.mediaDevices?.getUserMedia || !this.options.mediaConstraints) {
      await reportWebrtcResilienceMetric('media_recovery_failures', {
        consultationId: this.options.consultationId,
        requestId: this.options.requestId,
        reason: 'get_user_media_unavailable',
      });
      return null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        this.options.mediaConstraints,
      );
      this.attachLocalStream(stream);
      this.options.onLocalStreamRecovered?.(stream);
      return stream;
    } catch (error) {
      await reportWebrtcResilienceMetric('media_recovery_failures', {
        consultationId: this.options.consultationId,
        requestId: this.options.requestId,
        reason,
      });
      reportWebrtcFailure('webrtc_reconnect_failed', error, {
        consultationId: this.options.consultationId,
        requestId: this.options.requestId,
        reason,
      });
      return null;
    }
  }

  attachPageVisibilityRecovery(): void {
    if (this.pageVisibilityHandler || typeof document === 'undefined') {
      return;
    }
    this.pageVisibilityHandler = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      void this.recoverLocalMedia('page_visible');
      for (const peerId of this.peers.keys()) {
        this.scheduleReconnect(peerId, 'page_visible');
      }
    };
    document.addEventListener('visibilitychange', this.pageVisibilityHandler);
  }

  cleanupPeer(peerId: WebrtcPeerId): void {
    const runtime = this.peers.get(peerId);
    if (!runtime) return;
    runtime.removeListeners();
    if (runtime.reconnectTimer) clearTimeout(runtime.reconnectTimer);
    if (runtime.staleTimer) clearInterval(runtime.staleTimer);
    runtime.peer.close();
    this.peers.delete(peerId);
  }

  cleanupAll(): void {
    for (const peerId of Array.from(this.peers.keys())) {
      this.cleanupPeer(peerId);
    }
    stopStream(this.localStream);
    this.localStream = null;
    if (this.pageVisibilityHandler) {
      document.removeEventListener('visibilitychange', this.pageVisibilityHandler);
      this.pageVisibilityHandler = null;
    }
  }

  private scheduleReconnect(peerId: WebrtcPeerId, reason: string): void {
    const runtime = this.peers.get(peerId);
    if (!runtime || runtime.reconnectTimer) {
      return;
    }

    runtime.reconnectAttempts += 1;
    const attempt = runtime.reconnectAttempts;
    this.options.onReconnectAttempt?.(peerId, attempt);
    void reportWebrtcResilienceMetric('reconnect_attempts', {
      consultationId: this.options.consultationId,
      requestId: this.options.requestId,
      count: attempt,
      reason,
    });

    runtime.reconnectTimer = setTimeout(() => {
      const current = this.peers.get(peerId);
      if (!current) return;
      current.reconnectTimer = null;
      void this.restartIce(peerId, reason);
    }, backoffDelay(attempt, this.reconnectBaseMs, this.reconnectMaxMs));
  }

  private async recordReconnectSuccess(peerId: WebrtcPeerId): Promise<void> {
    const runtime = this.peers.get(peerId);
    if (!runtime || runtime.reconnectAttempts === 0) {
      return;
    }
    runtime.reconnectAttempts = 0;
    if (runtime.reconnectTimer) {
      clearTimeout(runtime.reconnectTimer);
      runtime.reconnectTimer = null;
    }
    this.options.onReconnectSuccess?.(peerId);
    await reportWebrtcResilienceMetric('reconnect_success', {
      consultationId: this.options.consultationId,
      requestId: this.options.requestId,
    });
  }

  private get stalePeerMs(): number {
    return this.options.stalePeerMs ?? DEFAULT_STALE_PEER_MS;
  }

  private get reconnectBaseMs(): number {
    return this.options.reconnectBaseMs ?? DEFAULT_RECONNECT_BASE_MS;
  }

  private get reconnectMaxMs(): number {
    return this.options.reconnectMaxMs ?? DEFAULT_RECONNECT_MAX_MS;
  }
}
