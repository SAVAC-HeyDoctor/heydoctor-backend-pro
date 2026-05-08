import { Injectable, type OnModuleInit } from '@nestjs/common';
import { primStr, registerAlertSink } from '../common/alerts/alert.hooks';

const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 1_000;

type Entry = {
  at: number;
  event: string;
  level: string;
  message?: string;
};

/**
 * Copia reciente de alertas enviadas a los sinks (memoria por instancia).
 * En cluster, cada réplica tiene su propia ventana.
 */
@Injectable()
export class OpsAlertsRecentService implements OnModuleInit {
  private entries: Entry[] = [];

  onModuleInit(): void {
    registerAlertSink((payload) => {
      const atRaw = payload.alertAt;
      const at =
        typeof atRaw === 'string'
          ? Date.parse(atRaw)
          : typeof atRaw === 'number'
            ? atRaw
            : Date.now();
      const event = primStr(payload.event, 'unknown');
      const level = primStr(
        payload.alertLevel,
        primStr(payload.severity, 'warning'),
      );
      const message =
        typeof payload.message === 'string' ? payload.message : undefined;
      this.entries.push({ at, event, level, message });
      const cutoff = Date.now() - TTL_MS;
      this.entries = this.entries
        .filter((e) => e.at >= cutoff)
        .slice(-MAX_ENTRIES);
    });
  }

  countLast24h(): number {
    const cutoff = Date.now() - TTL_MS;
    return this.entries.filter((e) => e.at >= cutoff).length;
  }

  getRecent(limit = 40): Entry[] {
    const cutoff = Date.now() - TTL_MS;
    return this.entries
      .filter((e) => e.at >= cutoff)
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);
  }
}
