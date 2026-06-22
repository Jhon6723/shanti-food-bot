# Known Issues and Roadmap

## Status: v1.5 — Manual driver assignment

---

## ✅ Fixed in v1.1

| # | Problem | Fix |
|---|---------|-----|
| 1 | Hardcoded customer name | Pass `name` + DB recovery for returning customers |
| 2 | Customizations limited to one | `handleCustomization` parses comma-separated numbers (`1,3`) |
| 3 | No "back" or "cancel" option | All handlers accept `0`, `atras` or `volver` |
| 4 | Modify order not implemented | `handleModify` with 4 functional options |
| 5 | Fragile product search by name | Numbered list in `showProductList()`, selection by number |
| 6 | Invalid input confirms/changes order | Strict validation on `delivery_type`, `payment`, `confirm` |
| 7 | Inconsistent phone normalization | `handleMessage` normalizes `573011758999` → `3011758999`. DB searches all 3 formats. |
| 8 | Empty cart on "back" in add_more | Protection against `pop()` on empty array |

## ✅ Fixed in v1.2

| # | Problem | Fix |
|---|---------|-----|
| 9 | Address not validated (length only) | Complete regex for Colombian formats — neighborhood/sector required for street addresses |
| 10 | Modify order asked for address again | `handleAddMore` skips `delivery_type` if `session.type` is already set |
| 11 | Hardcoded restaurant address | Environment variable `BUSINESS_ADDRESS` with fallback |
| 12 | No delivery notes step | New step `delivery_notes` (optional, can be skipped) |
| 13 | No previous address reuse | DB query when choosing delivery — `address_confirm` step if previous address exists |

## ✅ Fixed in v1.3

| # | Problem | Fix |
|---|---------|-----|
| 14 | Order status showed only one order | `findAllPendingByCustomer` + detail view + compact paginated list |

## ✅ Fixed in v1.4

| # | Problem | Fix |
|---|---------|-----|
| 15 | Hardcoded "25-30 minutos" delivery time in bot and API notifications | Use `estimatedReadyAt` (dynamic, based on product `preparationMinutes`) in `showOrderSummary`, `handleConfirmation`, and `preparing` notification |
| 16 | Customer name not shown in order summary/confirmation; name stored in lowercase | Preserve original case in `handleName` (pass `rawText` instead of lowercased `text`); display `👤 Cliente: *{name}*` in summary and confirmation messages |

## ✅ Fixed in v1.5

| # | Problem | Fix |
|---|---------|-----|
| P7 | No manual driver assignment — all delivery drivers see all ready orders | Add `assignedDriver` field to Order model + `assignDriver()` method. New `PATCH /orders/:id/assign` endpoint (admin only). Delivery API filters by `assignedDriver = userId`. Driver assignment UI in `OrderDetailModal`. DB migration adds `assigned_driver` column. |

---

## Production Infrastructure Issues

### I1. 504 Gateway Timeout after deploy (Coolify + Traefik)

**Symptoms**
- `curl https://shanti-bot.pixpro.lat/health` returns `504 Gateway Timeout`
- Direct access via IP: `curl http://178.105.185.165:3000/health` works fine
- Container shows `Up (healthy)` in `docker ps`
- Traefik returns `503 "no available server"` or hangs indefinitely

**Cause**
Coolify uses Traefik as a reverse proxy. When a new container is deployed, Traefik sometimes fails to update its routing table to point to the new container. It continues routing to the old (destroyed) container, causing a `504`.

**Diagnosis**
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

**Immediate fix**
```bash
ssh root@178.105.185.165
docker restart coolify-proxy
sleep 5
curl -s https://shanti-bot.pixpro.lat/health
```

**Mitigation (already applied)**
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

**⚠️ Note:** The healthcheck prevents Coolify from killing the container, but it does **NOT** fix the Traefik routing bug. The `504` can still happen after every deploy because Traefik sometimes fails to detect the new container. This is a Coolify/Traefik issue, not application code.

**Note:** If the healthcheck itself fails (e.g., wrong tool or wrong port), Coolify destroys the container completely (`docker ps -a` will not show it). Always check `docker ps` first.

**Permanent fix (in code)**
Implemented graceful shutdown in `src/index.ts` to mitigate Traefik's routing bug during rolling updates:

1. On `SIGTERM` (sent by Coolify during deploy), the app sets `isShuttingDown = true`
2. The `/health` endpoint returns `503` with status `shutting_down` for 10 seconds
3. This gives Traefik time to detect the unhealthy container and remove it from the routing pool
4. After 10s, the HTTP server closes gracefully

This is a workaround for Coolify issue #8627 — during rolling updates, Traefik continues routing to the dying container for several seconds. By marking ourselves as unhealthy before closing, we minimize the window of 504 errors.

### I2. Admin dashboard still polling after SSE deploy

**Symptoms**
- `GET /api/v1/orders` requests every ~5 seconds appear in server logs
- The `useOrdersWithSound()` hook includes SSE via `EventSource`
- Production still behaves like the old polling version

**Cause**
The admin dashboard is a PWA with a Service Worker (`sw.js`) that aggressively caches JS assets. After a deploy, the browser continues running the old cached code because the Service Worker never updated itself.

**Immediate fix (by user)**
1. Open `https://shanti-bot.pixpro.lat/admin`
2. **F12 → DevTools → Application → Service Workers**
3. Click **"Unregister"** on the active Service Worker
4. **Ctrl+Shift+R** (hard reload) — forces fresh assets

**Permanent fix (in code)**
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

**Symptoms**
- Bot replies work fine (messages sent via webhook)
- Order status change notifications fail: `[OpenWAAdapter] Failed to send message: {"statusCode":500,"message":"Internal server error"}`
- Admin dashboard shows status change succeeds, but WhatsApp message never arrives

**Technical cause**
OpenWA uses two types of identifiers for WhatsApp users:

1. **Phone JID** (normal users): `573011758999@c.us`
2. **LID (Long ID)** (certain users): `178327646171353@lid`

The OpenWA webhook always includes the original `chatId` (LID if applicable). Before the fix, this `chatId` was used to reply to the immediate message, but **was not persisted** with the order.

When the admin changed an order's status, the app constructed a phone-based JID from the saved number (`+573011758999` → `573011758999@c.us`). For LID users, OpenWA rejects this JID with a 500 error because it requires the LID.

**Bidirectionality analogy**
- **Before (unidirectional)**: User → bot (webhook with LID) → bot replies using LID ✅. But Admin → bot (notification) → bot used phone → failed for LID users ❌
- **Now (bidirectional)**: The webhook gives us the "key" (LID), we save it, and reuse it for all communications with that user.

**Fix implemented**
Persist the original `chatId` from the webhook and use it for all WhatsApp communications:

1. Added `chatId?: string` to `CustomerData` interface and `Customer` class
2. Added `customer_chat_id VARCHAR(50)` column to `orders` table with migration
3. Updated `OrderRepository` to save/retrieve `customer_chat_id`
4. `WebhookService` passes `chatId` from webhook payload to `WhatsAppBot`
5. `WhatsAppBot` stores `chatId` in session and passes it when creating `Order`
6. `WhatsAppSender.sendWhatsAppMessage` accepts optional `chatId` parameter
7. `notifyCustomer` in orders route uses `order.customer.chatId` if available

**Notes**
- Backward compatible: works with Meta adapter (no `chatId` in payload)
- Existing orders without `chatId` will continue using phone-based JID (may fail for LID users)
- New orders created after this fix will have the correct `chatId` stored
- Orders created via admin dashboard (not via bot) won't have `chatId` — this is expected

---

## Pending

### P1. No GPS location handling
**Problem**: `handleAddress` only accepts text. Does not process `message.location` from WhatsApp.
**Impact**: User cannot share live location for delivery.
**Solution**: Process `type: 'location'` in the webhook and extract coordinates.

### P2. No approved message templates (Meta)
**Problem**: For business-initiated notifications, Meta requires pre-approved templates.
**Impact**: The bot cannot proactively notify the client when the order is ready.
**Solution**: Create templates in Meta Business Manager. Partially covered by the **admin dashboard** (next phase).

### P3. In-memory sessions (not persistent)
**Problem**: `sessions = new Map<string, Session>()` is lost if the server restarts.
**Impact**: User in the middle of an order loses progress.
**Solution**: Migrate sessions to Redis or PostgreSQL.

### P4. No business hours validation
**Problem**: The bot accepts orders 24/7.
**Impact**: Orders placed during closed hours that nobody will prepare.
**Solution**: Environment variable `BUSINESS_HOURS` and rejection outside hours.

### P5. Large orders without human review
**Problem**: Orders with `total >= 50000` or more than 3 items remain in `pending` without anyone reviewing them.
**Impact**: Large orders can be forgotten.
**Solution**: **Admin dashboard** (next phase) — the administrator will see and manage these orders.

### P6. Orders API without authentication
**Problem**: See `docs/SECURITY.md` — issues #1, #2, #3.
**Solution**: JWT in admin dashboard phase + Meta webhook HMAC verification.

### P7. No manual driver assignment
**Status**: ✅ Fixed in v1.5
**Problem**: All delivery drivers see all ready orders. No way to assign a specific order to a specific driver.
**Impact**: With multiple drivers, orders can be delivered by anyone — no accountability or route optimization.
**Solution**: Add `assignedDriver` field to Order. Admin assigns orders to drivers via dashboard. Delivery API filters by `assignedDriver = userId`.

### P8. Delivery dashboard not optional for small businesses
**Problem**: The delivery dashboard is always enabled. For small businesses with one driver or direct contact, it adds unnecessary complexity.
**Impact**: Small business owners must manage delivery through the dashboard even when a simple WhatsApp contact would suffice.
**Solution**: Add `DELIVERY_DASHBOARD_ENABLED` env var. When disabled, admin manages delivery directly and contacts driver via WhatsApp.

---

## Roadmap

| Version | Goal | Issues |
|---------|------|--------|
| v1.1 | Robust flow | #1–8 ✅ |
| v1.2 | Improved UX + validations | #9–13 ✅ |
| v1.3 | Paginated status | #14 ✅ |
| v1.4 | **Admin dashboard + UX fixes** | #15, #16 ✅ — dynamic delivery time, customer name fix |
| v1.5 | **Driver management** | P7 ✅ — manual driver assignment |
| v2.0 | Production | P2, P3, P4 — Meta templates, persistent sessions, business hours |
| v2.1 | Optional delivery dashboard | P8 — optional delivery dashboard for small businesses |
