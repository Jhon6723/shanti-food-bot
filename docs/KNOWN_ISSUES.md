# Problemas Conocidos y Roadmap

## Estado: v1.3 — Pedidos paginados + seguridad documentada

---

## ✅ Arreglado en v1.1

| # | Problema | Fix |
|---|----------|-----|
| 1 | Nombre del cliente hardcodeado | Paso `name` + recuperación de DB para clientes recurrentes |
| 2 | Personalizaciones limitadas a una | `handleCustomization` parsea números separados por coma (`1,3`) |
| 3 | Sin opción de "atras" o "cancelar" | Todos los handlers aceptan `0`, `atras` o `volver` |
| 4 | Modificar pedido no implementado | `handleModify` con 4 opciones funcionales |
| 5 | Búsqueda de producto por nombre frágil | Lista numerada en `showProductList()`, selección por número |
| 6 | Input inválido confirma/cambia pedido | Validación estricta en `delivery_type`, `payment`, `confirm` |
| 7 | Phone normalization inconsistente | `handleMessage` normaliza `573011758999` → `3011758999`. DB busca los 3 formatos. |
| 8 | Carrito vacío al hacer "atras" en add_more | Protección contra `pop()` en array vacío |

## ✅ Arreglado en v1.2

| # | Problema | Fix |
|---|----------|-----|
| 9 | Dirección no validada (solo longitud) | Regex completo para formatos colombianos — barrio/sector obligatorio en direcciones de calle |
| 10 | Modificar pedido pedía dirección de nuevo | `handleAddMore` salta `delivery_type` si `session.type` ya está definido |
| 11 | Dirección del restaurante hardcodeada | Variable de entorno `BUSINESS_ADDRESS` con fallback |
| 12 | Sin paso de notas de entrega | Nuevo step `delivery_notes` (opcional, se puede omitir) |
| 13 | Sin reutilización de dirección previa | Consulta a DB al elegir domicilio — step `address_confirm` si hay dirección previa |

## ✅ Arreglado en v1.3

| # | Problema | Fix |
|---|----------|-----|
| 14 | Estado de pedido mostraba solo una orden | `findAllPendingByCustomer` + vista detalle + lista compacta paginada |

---

## � Production Infrastructure Issues

### I1. 504 Gateway Timeout after deploy (Coolify + Traefik)

**Síntomas**
- `curl https://shanti-bot.pixpro.lat/health` returns `504 Gateway Timeout`
- Direct access via IP: `curl http://178.105.185.165:3000/health` works fine
- Container shows `Up (healthy)` in `docker ps`
- Traefik returns `503 "no available server"` or hangs indefinitely

**Causa**
Coolify uses Traefik as a reverse proxy. When a new container is deployed, Traefik sometimes fails to update its routing table to point to the new container. It continues routing to the old (destroyed) container, causing a `504`.

**Diagnóstico**
```bash
# Check if the app container is actually running
ssh root@178.105.185.165
docker ps --filter "publish=3000" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Test direct access (bypasses Traefik)
curl http://178.105.185.165:3000/health
# Expected: {"status":"ok","db":"connected","ready":true,...}

# Test via domain (goes through Traefik)
curl -v https://shanti-bot.pixpro.lat/health
# Failing: hangs or returns 504
```

**Fix inmediato**
```bash
ssh root@178.105.185.165
docker restart coolify-proxy
sleep 5
curl -s https://shanti-bot.pixpro.lat/health
```

**Mitigación (ya aplicada)**
- Added `healthcheck` to the `app` service in `docker-compose.yml`
- Uses `wget --spider` (node:22-alpine does not include `curl`)
- Prevents Coolify from destroying the container when it takes time to start

```yaml
services:
  app:
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:3000/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 60s
```

**⚠️ Nota:** The healthcheck prevents Coolify from killing the container, but it does **NOT** fix the Traefik routing bug. The `504` can still happen after every deploy because Traefik sometimes fails to detect the new container. This is a Coolify/Traefik issue, not application code.

**Nota:** If the healthcheck itself fails (e.g., wrong tool or wrong port), Coolify destroys the container completely (`docker ps -a` will not show it). Always check `docker ps` first.

**Fix permanente (en código)**
Implemented graceful shutdown in `src/index.ts` to mitigate Traefik's routing bug during rolling updates:

1. On `SIGTERM` (sent by Coolify during deploy), the app sets `isShuttingDown = true`
2. The `/health` endpoint returns `503` with status `shutting_down` for 10 seconds
3. This gives Traefik time to detect the unhealthy container and remove it from the routing pool
4. After 10s, the HTTP server closes gracefully

This is a workaround for Coolify issue #8627 — during rolling updates, Traefik continues routing to the dying container for several seconds. By marking ourselves as unhealthy before closing, we minimize the window of 504 errors.

### I2. Admin dashboard still polling after SSE deploy

**Síntomas**
- `GET /api/v1/orders` requests every ~5 seconds appear in server logs
- The `useOrdersWithSound()` hook includes SSE via `EventSource`
- Production still behaves like the old polling version

**Causa**
The admin dashboard is a PWA with a Service Worker (`sw.js`) that aggressively caches JS assets. After a deploy, the browser continues running the old cached code because the Service Worker never updated itself.

**Fix inmediato (por usuario)**
1. Open `https://shanti-bot.pixpro.lat/admin`
2. **F12 → DevTools → Application → Service Workers**
3. Click **"Unregister"** on the active Service Worker
4. **Ctrl+Shift+R** (hard reload) — forces fresh assets

**Fix permanente (en código)**
Added a small inline script to `admin/index.html` that forces the Service Worker to check for updates on every page load:

```html
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(function(registration) {
      registration.update();
    });
  }
</script>
```

This calls `registration.update()` which checks the server for a new `sw.js`. If found, the browser installs the new version and prompts the user to reload (or auto-reloads on next visit).

### I3. OpenWAAdapter notifications fail with 500 error

**Síntomas**
- Bot replies work fine (messages sent via webhook)
- Order status change notifications fail: `[OpenWAAdapter] Failed to send message: {"statusCode":500,"message":"Internal server error"}`
- Admin dashboard shows status change succeeds, but WhatsApp message never arrives

**Causa técnica**
OpenWA usa dos tipos de identificadores para usuarios de WhatsApp:

1. **JID de teléfono** (usuarios normales): `573011758999@c.us`
2. **LID (Long ID)** (ciertos usuarios): `178327646171353@lid`

El webhook de OpenWA siempre incluye el `chatId` original (LID si aplica). Antes del fix, este `chatId` se usaba para responder al mensaje inmediato, pero **no se persistía** con la orden.

Cuando el admin cambiaba el estado de una orden, la app construía un JID de teléfono desde el número guardado (`+573011758999` → `573011758999@c.us`). Para usuarios LID, OpenWA rechaza este JID con 500 error porque requiere el LID.

**Analogía de bidireccionalidad**
- **Antes (unidireccional)**: Usuario → bot (webhook con LID) → bot responde usando LID ✅. Pero Admin → bot (notificación) → bot usaba teléfono → fallaba para LID users ❌
- **Ahora (bidireccional)**: El webhook nos da la "llave" (LID), la guardamos, y la reutilizamos para todas las comunicaciones con ese usuario.

**Fix implementado**
Persist the original `chatId` from the webhook and use it for all WhatsApp communications:

1. Added `chatId?: string` to `CustomerData` interface and `Customer` class
2. Added `customer_chat_id VARCHAR(50)` column to `orders` table with migration
3. Updated `OrderRepository` to save/retrieve `customer_chat_id`
4. `WebhookService` passes `chatId` from webhook payload to `WhatsAppBot`
5. `WhatsAppBot` stores `chatId` in session and passes it when creating `Order`
6. `WhatsAppSender.sendWhatsAppMessage` accepts optional `chatId` parameter
7. `notifyCustomer` in orders route uses `order.customer.chatId` if available

**Notas**
- Backward compatible: works with Meta adapter (no `chatId` in payload)
- Existing orders without `chatId` will continue using phone-based JID (may fail for LID users)
- New orders created after this fix will have the correct `chatId` stored
- Orders created via admin dashboard (not via bot) won't have `chatId` — this is expected

---

## �� Pendiente

### P1. Sin manejo de ubicación GPS
**Problema**: `handleAddress` solo acepta texto. No procesa `message.location` de WhatsApp.
**Impacto**: Usuario no puede compartir ubicación en vivo para domicilio.
**Solución**: Procesar `type: 'location'` en el webhook y extraer coordenadas.

### P2. Sin plantillas de mensajes aprobados (Meta)
**Problema**: Para notificaciones iniciadas por el negocio, Meta requiere plantillas pre-aprobadas.
**Impacto**: El bot no puede notificar proactivamente al cliente cuando el pedido está listo.
**Solución**: Crear plantillas en Meta Business Manager. Cubierto parcialmente por el **admin dashboard** (fase siguiente).

### P3. Sesiones en memoria (no persistentes)
**Problema**: `sessions = new Map<string, Session>()` se pierde si el servidor reinicia.
**Impacto**: Usuario a mitad de pedido pierde progreso.
**Solución**: Migrar sesiones a Redis o PostgreSQL.

### P4. Sin validación de horario de atención
**Problema**: El bot acepta pedidos 24/7.
**Impacto**: Pedidos en horario cerrado que nadie va a preparar.
**Solución**: Variable de entorno `BUSINESS_HOURS` y rechazo fuera de horario.

### P5. Pedidos grandes sin revisión humana
**Problema**: Pedidos con `total >= 50000` o más de 3 ítems quedan en `pending` sin que nadie los revise.
**Impacto**: Pedidos grandes pueden quedar olvidados.
**Solución**: **Admin dashboard** (fase siguiente) — el administrador verá y gestionará estos pedidos.

### P6. API de órdenes sin autenticación
**Problema**: Ver `docs/SECURITY.md` — issues #1, #2, #3.
**Solución**: JWT en fase admin dashboard + verificación HMAC webhook Meta.

---

## Roadmap

| Versión | Objetivo | Issues |
|---------|----------|--------|
| v1.1 | Flujo robusto | #1–8 ✅ |
| v1.2 | UX mejorada + validaciones | #9–13 ✅ |
| v1.3 | Estado paginado | #14 ✅ |
| v1.4 | **Admin dashboard (en progreso)** | P5, P6 — JWT + CRUD pedidos + estadísticas |
| v2.0 | Producción | P2, P3, P4 — plantillas Meta, sesiones persistentes, horarios |
