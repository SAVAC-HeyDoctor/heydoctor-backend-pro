# Railway — autoscaling y métricas HeyDoctor

## Panel Railway (fuera del repo)

En **Railway → Service → Settings → Scaling**:

- Activar **horizontal scaling** según **CPU** y **memoria** según carga esperada.
- El endpoint `GET /api/admin/ops/scaling` expone **señales heurísticas** para decidir políticas manualmente o vía integraciones; **Railway no lee este JSON automáticamente** — la política real de réplicas es la del panel o la proveedor.

## Reglas sugeridas (orientativas)

| Señal | Condición | Acción sugerida |
|-------|-----------|------------------|
| Carga | `requestsPerMinute` > 200 | Considerar más réplicas o revisar cuellos de botella |
| Errores | `errorRate` > 5% | Scale up + investigar 5xx (Payku, DB, timeouts) |
| Latencia | `avgResponseTime` > 800 ms | Scale up o optimizar consultas / dependencias |
| Tráfico bajo | `requestsPerMinute` < 20 (sostenido) | Scale down para coste |

Ajustar umbrales según baseline real (hora punta vs valle).

## Métricas `GET /api/admin/ops/scaling`

- `cpuLoad`: media de carga del SO (`os.loadavg()[0]` en Unix; en Windows puede ser `0`).
- `requestsPerMinute`, `avgResponseTime`, `errorRate`: agregadas como en `/admin/ops/overview` (Redis si está configurado).
