export type SocketIoRedisHealth = {
  adapter: 'redis' | 'local';
  status:
    | 'disabled'
    | 'connecting'
    | 'ready'
    | 'degraded'
    | 'unavailable'
    | 'ended';
  redisConfigured: boolean;
  pubStatus: string | null;
  subStatus: string | null;
  lastEventAt: string;
  lastError: string | null;
};

let health: SocketIoRedisHealth = {
  adapter: 'local',
  status: 'disabled',
  redisConfigured: false,
  pubStatus: null,
  subStatus: null,
  lastEventAt: new Date(0).toISOString(),
  lastError: null,
};

export function setSocketIoRedisHealth(
  patch: Partial<SocketIoRedisHealth>,
): void {
  health = {
    ...health,
    ...patch,
    lastEventAt: new Date().toISOString(),
  };
}

export function getSocketIoRedisHealth(): SocketIoRedisHealth {
  return { ...health };
}
