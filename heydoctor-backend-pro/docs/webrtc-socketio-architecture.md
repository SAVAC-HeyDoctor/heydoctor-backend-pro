# WebRTC / Socket.IO — Arquitectura y notas clave

## Contexto

La teleconsulta usa Socket.IO + WebRTC para signaling. Se detectó y resolvió un bug crítico donde el cliente quedaba en **`operation has timed out`** durante **`join-consultation`**.

## Problema que ocurría

El gateway tenía:

```ts
@UseGuards(FeatureGuard)
@RequirePlan(SubscriptionPlan.PRO)
```

Estos guards están orientados al flujo HTTP.

En WebSocket:

- Se ejecutaban antes del handler.
- Dependían de `client.data.user`.
- En algunos casos el usuario aún no estaba disponible.
- El guard bloqueaba la ejecución.

Resultado:

- `@SubscribeMessage` no se ejecutaba.
- No había `return` con payload de éxito.
- Socket.IO no enviaba ACK al cliente.
- El cliente hacía timeout en `socket.timeout(...).emit(..., ack)`.

## Solución aplicada

### 1. Eliminar guards del gateway WebSocket

No usar guards HTTP en el gateway:

```ts
// NO usar en WS
@UseGuards(FeatureGuard)
@RequirePlan(SubscriptionPlan.PRO)
```

**Commit de referencia (backend):** `79ec28a`

### 2. Autenticación en `handleConnection()`

Responsabilidades:

- Validar JWT (cookie / `handshake.auth` / header).
- Validar usuario.
- Validar plan PRO.
- Desconectar si no cumple.

Así, los sockets que permanecen conectados pasan un primer filtro de auth/plan.

### 3. Validación de negocio en handlers

Ejemplo en `joinConsultation`:

```ts
const planOk = await this.subscriptionsService.hasRequiredPlan(
  user.sub,
  SubscriptionPlan.PRO,
);
if (!planOk) {
  throw new WsException('PRO plan required for video calls');
}
```

Los errores en handlers WS deben preferir **`WsException`** para una respuesta coherente con Socket.IO.

### 4. `JwtAuthGuard` solo para HTTP

El guard global fue ajustado para **no** ejecutar Passport en contexto distinto de `http`:

```ts
if (context.getType() !== 'http') {
  return true;
}
```

**Commit de referencia (backend):** `ea325c7`

## Arquitectura final

| Capa                 | Responsabilidad       |
| -------------------- | --------------------- |
| `handleConnection()` | Auth + plan           |
| `joinConsultation()` | Validación de negocio |
| Guards de features   | Solo rutas HTTP       |

## Resultado esperado

- `join-consultation` puede ejecutar el handler y responder con ACK cuando corresponde.
- El cliente ya no permanece bloqueado en timeout por ausencia de ACK en ese paso (salvo errores de red/servidor).
- WebRTC puede continuar (ICE / negociación SDP / media).

## Notas importantes

- En Socket.IO con callback de acknowledgment, si el handler no completa respuesta esperada, el cliente puede esperar hasta el timeout configurado en el cliente.
- Los guards pensados solo para **`switchToHttp()`** no deben aplicarse al gateway WS como sustituto de auth en connection.
- En WebSocketNest, lanzar **`WsException`** suele integrarse mejor con el ciclo de mensajes que excepciones HTTP genéricas.

## Debug en frontend

```bash
NEXT_PUBLIC_WEBRTC_DEBUG=1
```

En consola del navegador aparecen líneas con prefijo `[heydoctor:webrtc]` (timeouts de ACK aumentados y reconexión Socket.IO).

**Commit de referencia (frontend):** `1e72808c`

## Infra recomendada

- **Socket.IO:** el cliente típico usa **`io('{API_ORIGIN}/webrtc', { path: '/socket.io' })`**; en DevTools → Network → **WS**, la URL suele mostrarse contra **`/socket.io`** con handshake al namespace **`/webrtc`**.
- **TURN:** configurar **`WEBRTC_TURN_URLS`**, **`WEBRTC_TURN_USERNAME`**, **`WEBRTC_TURN_CREDENTIAL`** para redes restrictivas sin relay directo.
- **Multi-réplica:** si hay más de una instancia del servidor, considerar **adapter Redis** de Socket.IO para compartir salas entre procesos.

## Conclusión

El problema no era “WebRTC en sí” como primera causa visible, sino el **uso de guards HTTP en el gateway WebSocket**, que impedía ejecutar el handler y devolver ACK en `join-consultation`.

La solución separa:

- **Auth y plan en la conexión** (`handleConnection`).
- **Reglas de negocio en los handlers** (`joinConsultation`, relay offer/answer, etc.).
- **Guards REST** únicamente en controladores HTTP.
