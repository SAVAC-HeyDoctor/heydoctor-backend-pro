import { ArgumentsHost, Catch } from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { captureException } from '../observability/sentry';

@Catch()
export class SentryWsExceptionFilter extends BaseWsExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    const ws = host.switchToWs();
    const client = ws.getClient<Socket>();
    const user = client.data as
      | { user?: { sub?: string; clinicId?: string | null } }
      | undefined;

    captureException(exception, {
      event: 'websocket_exception',
      namespace: client.nsp?.name,
      socketId: client.id,
      userId: user?.user?.sub,
      clinicId: user?.user?.clinicId ?? null,
    });

    super.catch(exception, host);
  }
}
