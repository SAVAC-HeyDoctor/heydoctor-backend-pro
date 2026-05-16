import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplicationContext } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

type SocketIoRedisAdapter = ReturnType<typeof createAdapter>;

const REDIS_CONNECT_TIMEOUT_MS = 2_500;

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: SocketIoRedisAdapter | null = null;
  private pubClient: Redis | null = null;
  private subClient: Redis | null = null;
  private loggedLocalAdapter = false;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) {
      this.logger.warn(
        'socket_io_redis_adapter_disabled: REDIS_URL is not configured; WebSocket rooms are local to this process',
      );
      return;
    }

    const pubClient = this.createRedisClient(redisUrl, 'pub');
    const subClient = pubClient.duplicate();
    this.attachRedisLogging(pubClient, 'pub');
    this.attachRedisLogging(subClient, 'sub');

    try {
      await this.withTimeout(
        Promise.all([pubClient.connect(), subClient.connect()]).then(
          () => undefined,
        ),
        REDIS_CONNECT_TIMEOUT_MS,
      );
      this.pubClient = pubClient;
      this.subClient = subClient;
      this.adapterConstructor = createAdapter(pubClient, subClient, {
        requestsTimeout: 5_000,
        publishOnSpecificResponseChannel: true,
      });
      this.logger.log('socket_io_redis_adapter_enabled');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error('socket_io_redis_adapter_unavailable', {
        event: 'socket_io_redis_adapter_unavailable',
        error: error.message,
      });
      this.disconnectRedisClients(pubClient, subClient);
      this.adapterConstructor = null;
    }
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
      return server;
    }
    if (!this.loggedLocalAdapter) {
      this.loggedLocalAdapter = true;
      this.logger.warn(
        'socket_io_local_adapter_active: distributed WebSocket room sync is disabled',
      );
    }
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    this.disconnectRedisClients(this.pubClient, this.subClient);
    this.pubClient = null;
    this.subClient = null;
    this.adapterConstructor = null;
  }

  private createRedisClient(redisUrl: string, role: 'pub' | 'sub'): Redis {
    return new Redis(redisUrl, {
      connectionName: `heydoctor-socket-io-${role}`,
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: null,
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      retryStrategy: (times) => Math.min(times * 250, 5_000),
    });
  }

  private attachRedisLogging(client: Redis, role: 'pub' | 'sub'): void {
    client.on('connect', () => {
      this.logger.log(`socket_io_redis_${role}_connect`);
    });
    client.on('ready', () => {
      this.logger.log(`socket_io_redis_${role}_ready`);
    });
    client.on('reconnecting', () => {
      this.logger.warn(`socket_io_redis_${role}_reconnecting`);
    });
    client.on('end', () => {
      this.logger.warn(`socket_io_redis_${role}_end`);
    });
    client.on('error', (err: Error) => {
      this.logger.error(`socket_io_redis_${role}_error`, {
        event: `socket_io_redis_${role}_error`,
        error: err.message,
      });
    });
  }

  private async withTimeout(
    promise: Promise<void>,
    timeoutMs: number,
  ): Promise<void> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        promise,
        new Promise<void>((_, reject) => {
          timeout = setTimeout(() => {
            reject(new Error('Redis connection timeout'));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private disconnectRedisClients(
    pubClient: Redis | null,
    subClient: Redis | null,
  ): void {
    for (const client of [pubClient, subClient]) {
      try {
        client?.disconnect();
      } catch {
        /* noop */
      }
    }
  }
}
