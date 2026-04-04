import { Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';

const logger = new Logger('RoutesProbe');

type ExpressLayer = {
  route?: { path: string; methods: Record<string, boolean> };
  name?: string;
  handle?: { stack?: ExpressLayer[] };
};

/**
 * Volcado opcional de rutas Express (útil si en logs de Nest no ves
 * `Mapped {/api/auth/login, POST}`). Activar con LOG_NEST_ROUTES=true.
 */
export function logExpressRouteStackIfEnabled(app: INestApplication): void {
  if (process.env.LOG_NEST_ROUTES !== 'true') {
    return;
  }

  try {
    const instance = app.getHttpAdapter().getInstance() as {
      _router?: { stack?: ExpressLayer[] };
    };
    const lines: string[] = [];

    const walk = (stack: ExpressLayer[] | undefined): void => {
      if (!stack) return;
      for (const layer of stack) {
        if (layer.route?.path != null) {
          const path = String(layer.route.path);
          for (const m of Object.keys(layer.route.methods)) {
            if (layer.route.methods[m]) {
              lines.push(`${m.toUpperCase().padEnd(7)} ${path}`);
            }
          }
        }
        if (layer.name === 'router' && layer.handle?.stack) {
          walk(layer.handle.stack);
        }
      }
    };

    walk(instance._router?.stack);
    lines.sort();
    const authLines = lines.filter((l) => l.toLowerCase().includes('auth'));
    logger.log(
      `LOG_NEST_ROUTES: ${lines.length} route layer(s); auth-related:\n${authLines.join('\n') || '(none — check Nest global prefix / mounting)'}`,
    );
  } catch (err) {
    logger.warn(`LOG_NEST_ROUTES failed: ${String(err)}`);
  }
}
