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

**Fix permanente**
- Added `healthcheck` to the `app` service in `docker-compose.yml` with a 60s `start_period`
- Added `wget --spider` health check (node:22-alpine does not include `curl`)
- Coolify reads Docker health checks and only routes to "healthy" containers

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

**Nota:** If the healthcheck fails (e.g., wrong tool or wrong port), Coolify destroys the container completely (`docker ps -a` will not show it). Always check `docker ps` first.

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
