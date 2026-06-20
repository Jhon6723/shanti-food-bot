# Estrategias de Actualización en Tiempo Real

## Contexto

El dashboard de administración de Shanti Food necesita mostrar cambios de pedidos en tiempo real (nuevos pedidos, cambios de estado, notificaciones). Actualmente el frontend debe hacer polling manual o recargar la página para ver actualizaciones.

Este documento compara tres estrategias para recibir actualizaciones del servidor: **Polling**, **Long Polling**, **Server-Sent Events (SSE)** y **WebSockets**.

---

## 1. Polling Clásico (Short Polling)

### Cómo funciona

El cliente envía una petición HTTP cada N segundos para preguntar "hay novedades?".

```
Cliente                              Servidor
   │ ───── GET /orders/poll ──────>    │
   │ <──── [] (200 OK) ───────────     │  ← no hay nada nuevo
   │         (espera 5 seg)            │
   │ ───── GET /orders/poll ──────>    │
   │ <──── [nuevo pedido] ────────     │  ← hay novedad
```

### Pros

- **Ultra-simple** de implementar: un `setInterval` con `fetch`.
- Compatible con cualquier servidor HTTP (Express, nginx, CDN).
- Fácil de cachear y escalar horizontalmente con balanceadores.

### Contras

- **Latencia alta**: el cliente descubre el evento hasta N segundos después.
- **Waste de recursos**: si no hay eventos, se hacen requests innecesarios que consumen CPU, red y batería del cliente.
- **Saturación del servidor**: 1000 clientes × 1 req/5s = 200 req/seg solo preguntando.
- HTTP overhead: headers completos (cookies, auth, content-type) en cada petición.

### ¿Cuándo usarlo?

- Datos que cambian muy poco (cada minutos o más).
- Clientes con recursos limitados donde mantener una conexión abierta es caro.
- Como fallback cuando el navegador no soporta otras tecnologías.

---

## 2. Long Polling

### Cómo funciona

El cliente hace una petición HTTP y **el servidor no responde inmediatamente**. Espera hasta que haya datos nuevos o hasta un timeout (ej: 30s). Cuando el servidor responde, el cliente inmediatamente hace otra petición.

```
Cliente                              Servidor
   │ ───── GET /orders/poll ──────>    │
   │         (espera hasta 30s)        │  ← conexión abierta
   │ <──── [nuevo pedido] ────────     │  ← responde apenas hay evento
   │ ───── GET /orders/poll ──────>    │  ← inmediatamente nueva petición
   │         (espera...)               │
```

### Pros

- **Baja latencia**: el cliente recibe el evento casi inmediatamente (ms, no segundos).
- **Menos requests**: solo se hace un request por evento, no uno cada N segundos.
- **Compatible con HTTP 1.1**: funciona detrás de proxies, firewalls y balanceadores.
- **Menor waste** que short polling si los eventos son esporádicos.

### Contras

- **Complejidad del servidor**: necesitas manejar requests "suspendidas" y notificarlas cuando hay eventos.
- **Timeout management**: proxies y navegadores pueden cerrar conexiones largas (30s, 60s). Debes manejar el re-conectar.
- **HTTP overhead**: aunque menos frecuentes, cada request sigue llevando headers completos.
- **HOL blocking**: si un evento tarda mucho, bloquea la llegada de otros (aunque esto se mitiga con conexiones paralelas).
- **Recursos del servidor**: mantener miles de requests HTTP abiertos consume memoria y file descriptors.

### ¿Es rentable para Shanti?

**Sí, como solución intermedia.** Si tienes pocos clientes conectados simultáneamente (dashboard solo lo ven 1-3 administradores), long polling es razonable y fácil de implementar sobre Express existente.

Pero si escalas a muchos usuarios conectados (clientes monitoreando sus pedidos desde el celular), se vuelve costoso mantener conexiones HTTP abiertas.

---

## 3. Server-Sent Events (SSE)

### Cómo funciona

Es una conexión HTTP **unidireccional** donde el servidor "empuja" eventos al cliente usando el formato `text/event-stream`. El cliente usa la API nativa `EventSource` del navegador.

```
Cliente                              Servidor
   │ ───── GET /events ───────────>    │
   │ <──── data: {evento 1}\n\n       │  ← conexión persistente
   │ <──── data: {evento 2}\n\n       │  ← servidor empuja más eventos
   │ <──── data: {evento 3}\n\n       │  ← misma conexión, sin nuevo handshake
```

Formato del stream:
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"type":"new_order","id":"SH-001","total":25000}\n\n
id: 42\nevent: status_change\ndata: {"orderId":"SH-001","status":"ready"}\n\n
```

### Pros

- **Nativo del navegador**: `const es = new EventSource('/events')`, sin librerías.
- **Reconexión automática**: el navegador maneja reconexión, `Last-Event-ID` para reanudar desde el último evento recibido.
- **Unidireccional** (servidor → cliente): perfecto para "notificaciones de estado" donde el cliente no necesita enviar nada por esa vía.
- **Sobre HTTP**: funciona con proxies, firewalls, balanceadores y CDN (sin upgrade).
- **Menor overhead que WebSockets**: headers HTTP solo una vez al inicio, luego solo payload.

### Contras

- **Unidireccional**: si el cliente necesita enviar algo (ej: "confirmar que vi la notificación"), requiere un request HTTP separado o usar WebSockets.
- **Límite de conexiones HTTP 1.1**: los navegadores limitan ~6 conexiones simultáneas por dominio. SSE consume una.
- **No soportado nativamente en IE/Edge legacy** (aunque polyfills existen).
- **Requiere conexión persistente**: si usas serverless (Lambda, Vercel), no funciona (necesitas servidor con conexiones abiertas).

### Implementación en Express (mínima)

```typescript
// src/api/routes/events.ts
import { Router } from 'express';

const router = Router();
const clients = new Set<Response>(); // conexiones SSE activas

router.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.add(res);
  req.on('close', () => clients.delete(res));
});

// Función para emitir a todos los clientes conectados
export function broadcastEvent(data: unknown) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(res => res.write(payload));
}

export default router;
```

### ¿Cuándo usarlo en Shanti?

**Recomendado como primera opción** para:
- Notificar al dashboard de nuevos pedidos entrantes.
- Actualizar estado de pedidos en tiempo real (pending → confirmed → preparing → ready).
- Alertas del sistema (pedido cancelado, stock bajo).

---

## 4. WebSockets

### Cómo funciona

Protocolo **bidireccional full-duplex** sobre TCP. Inicia como HTTP pero hace un `Upgrade: websocket` handshake. Luego la conexión se mantiene abierta en ambos sentidos sin headers HTTP.

```
Cliente                              Servidor
   │ ───── GET /ws HTTP/1.1 ──────>    │
   │       Upgrade: websocket            │
   │       Connection: Upgrade           │
   │ <──── 101 Switching Protocols ─   │  ← handshake
   │ ─────── conexión persistente ───>  │  ← frame WS: client → server
   │ <────── conexión persistente ───  │  ← frame WS: server → client
   │ ─────── frame WS ─────────────>   │
   │ <────── frame WS ──────────────    │
```

### Pros

- **Bidireccional**: cliente y servidor envían mensajes en cualquier momento.
- **Overhead mínimo**: después del handshake, los frames WS tienen solo 2-14 bytes de overhead (vs headers HTTP completos).
- **Latencia ultra-baja**: ideal para chat, juegos, trading.
- **Soportado en navegadores, móviles, Node.js**.

### Contras

- **Complejidad**: necesitas manejar reconexión, heartbeat/ping-pong para detectar conexiones muertas, estado de conexión, rooms/topics.
- **No compatible con HTTP caching/CDN**: los proxies y balanceadores deben soportar WS explícitamente.
- **Escalabilidad horizontal complicada**: con múltiples servidores, necesitas un pub/sub externo (Redis, RabbitMQ) para compartir mensajes entre nodos.
- **Recursos del servidor**: miles de conexiones WS abiertas consumen memoria y file descriptors (aunque menos que HTTP long polling).
- **Firewall/proxy issues**: algunos proxies corporativos bloquean WS.

### Implementación básica (ws + Express)

```typescript
import { WebSocketServer } from 'ws';
import http from 'http';

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    // Procesar mensaje del cliente
    const data = JSON.parse(msg.toString());
    // ...
  });

  // Enviar notificación
  ws.send(JSON.stringify({ type: 'new_order', orderId: 'SH-001' }));
});

server.listen(3000);
```

### ¿Cuándo usarlo en Shanti?

**Opcional / futuro.** WebSockets son overkill si solo necesitas:
- Notificaciones del servidor al cliente (SSE es suficiente).
- Actualizaciones de estado unidireccionales.

Sería útil si en el futuro agregas:
- Chat en vivo entre cliente y repartidor/admin.
- Colaboración en tiempo real (múltiples admins editando simultáneamente).
- Juego/interacción bidireccional compleja.

---

## Comparativa Rápida

| Característica | Short Polling | Long Polling | SSE | WebSockets |
|---------------|---------------|--------------|-----|------------|
| **Dirección** | Cliente → Servidor | Cliente → Servidor | Servidor → Cliente | Bidireccional |
| **Latencia** | Alta (N seg) | Baja (ms) | Baja (ms) | Ultra-baja (ms) |
| **Requests HTTP** | Muchas | Menos | 1 persistente | 1 upgrade + frames |
| **Overhead** | Alto (headers × N) | Alto (headers × evento) | Bajo (1 headers, luego stream) | Mínimo (frames) |
| **Implementación** | trivial | media | media | alta |
| **Reconexión** | manual | manual | automática (navegador) | manual (librería) |
| **Escalabilidad** | alta | media | media-alta | media (necesita pub/sub) |
| **Compatibilidad** | universal | universal | modern browsers | universal |
| **Firewalls/Proxies** | sin problemas | timeouts posibles | sin problemas | puede bloquearse |
| **HTTP 1.1 limit** | no aplica | no aplica | 6 conexiones/dominio | no aplica |

---

## Recomendación para Shanti Food

### Fase 1 (ahora): SSE

Implementar SSE para el dashboard de administración:

```
GET /api/v1/events  →  EventSource con notificaciones de pedidos
```

Eventos a emitir:
- `new_order` — nuevo pedido entrante (suena notificación).
- `status_update` — pedido cambió de estado (pending → confirmed → preparing → ready → delivered).
- `cancelled` — pedido cancelado (alerta roja).

**Por qué SSE y no WebSockets:**
- El dashboard solo *recibe* actualizaciones, no necesita enviar nada por la conexión persistente.
- SSE es más simple, funciona sobre HTTP estándar, y tiene reconexión automática.
- WebSockets sería overkill y más complejo de escalar.

### Fase 2 (futuro): WebSockets

Si en el futuro agregas:
- Chat cliente-repartidor en vivo.
- Múltiples admins colaborando en el mismo pedido.
- Notificaciones push bidireccionales (cliente confirma recepción).

Entonces migrar o complementar con WebSockets (posiblemente usando Socket.IO o similar).

### Fase 0 (fallback): Polling clásico

Mantener polling como fallback para:
- Clientes con navegadores antiguos.
- Entornos donde proxies corporativos bloquean conexiones persistentes.
- Testing y desarrollo rápido antes de implementar SSE.

---

## Referencias

- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [MDN: EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
- [MDN: WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [RFC 6202: Known Issues and Best Practices for Long Polling](https://datatracker.ietf.org/doc/html/rfc6202)
- [Heroku: WebSockets vs. Long Polling vs. SSE](https://devcenter.heroku.com/articles/websocket-security)
