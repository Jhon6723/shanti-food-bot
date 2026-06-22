# Shanti Food Bot Architecture

## Overview

WhatsApp ordering system for Arroceria Shanti. **Monorepo** with Express backend (existing) and admin PWA frontend (in development). Built with **Spec Driven Development** and **TypeScript**.

## Layers

```
┌─────────────────────────────────────────┐
│  WhatsApp Client                        │
│  (text message)                         │
└──────────┬──────────────────────────────┘
           │ Webhook HTTPS
           ▼
┌─────────────────────────────────────────┐
│  WhatsApp Provider (configurable)       │
│  meta:   Meta Cloud API                 │
│  openwa: OpenWA Gateway (self-hosted)   │
└──────────┬──────────────────────────────┘
           │ POST /api/v1/webhooks/whatsapp
           ▼
┌─────────────────────────────────────────┐
│  Express API (src/api/routes/)          │
│  • webhook.ts  — receives messages       │
│  • orders.ts   — order CRUD (JWT)        │
│  • events.ts   — SSE (real-time)         │
│  • products.ts — list menu               │
│  • auth.ts     — login + JWT (new)       │
│  • users.ts    — user CRUD (new)         │
│  • /admin      — serves static PWA       │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  Bot Layer (src/bot/WhatsAppBot.ts)     │
│  Session management + conversational FSM │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  Domain Layer (src/domain/models/)      │
│  • Order.ts   — entity + rules           │
│  • Product.ts — catalog + search         │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  Infrastructure Layer                   │
│  • OrderRepository.ts  — PostgreSQL      │
│  • UserRepository.ts   — PostgreSQL      │
│  • connection.ts       — pg pool         │
│  • whatsapp/           — Adapter pattern │
│    ├ adapter.ts         — Interface      │
│    ├ meta/MetaAdapter   — Meta Cloud API │
│    └ openwa/OpenWA      — OpenWA Gateway │
└─────────────────────────────────────────┘
```

## Monorepo Structure

```
shanti-food/
  src/                     ← Express backend
  tests/                   ← unit and integration tests
  admin/                   ← admin PWA (React + Vite)
  specs/                   ← SDD and OpenAPI
  docs/                    ← documentation
  package.json
  docker-compose.yml
  .env
```

See `specs/admin-dashboard.md §11` for detailed structure and Coolify configuration.

## Deployment (Hetzner + Coolify)

- Single service in Coolify
- Express compiles and serves the static frontend from `GET /admin`
- Build command: `npm run build` (compiles `admin/` + TypeScript backend)
- Start command: `npm start`

## Incoming Message Flow

1. User sends message to the connected WhatsApp number
2. The active provider (`WHATSAPP_PROVIDER`) POSTs to the webhook with JSON payload
3. `webhook.ts` gets the adapter via `getAdapter()` and verifies the signature (if secret exists)
4. `adapter.parseIncoming(req)` normalizes the payload to `WhatsAppWebhookPayload[]`
5. Calls `bot.handleMessage(phone, {text})`
6. Bot queries/creates session in memory (`Map<string, Session>`)
7. According to `session.step`, executes the corresponding handler
8. Generates text response
9. `adapter.sendMessage(phone, text, {chatId})` sends response via the active provider
10. Saves order in PostgreSQL upon confirmation

See `specs/whatsapp-adapter.md` for Adapter pattern details.

## Conversational Flow (FSM)

```
null (welcome)
  ├─ "hola" → reset + welcomeMessage()
  ├─ "1/menu" → menu
  ├─ "2/order" → name (new) | product (returning customer)
  ├─ "3/status" → checkOrderStatus() → [order_status if pagination]
  ├─ "4/human" → connect
  └─ "status" (keyword) → checkOrderStatus() from any step

name → product → customization → quantity → add_more
  └─ 1 (yes) → product
  └─ 2 (no) → delivery_type
        ├─ 1 (delivery, with prev. address) → address_confirm
        │     ├─ 1 (reuse) → delivery_notes → payment → confirm
        │     └─ 2 (new)   → address → delivery_notes → payment → confirm
        ├─ 1 (delivery, no prev. address) → address → delivery_notes → payment → confirm
        └─ 2 (pickup) → payment → confirm

confirm
  ├─ 1 (confirm) → save to DB → end
  ├─ 2 (cancel)  → reset
  └─ 3 (modify) → modify
        ├─ 1 (add)    → product → ... → confirm (skips delivery_type if type already set)
        ├─ 2 (remove) → selection → confirm
        ├─ 3 (address) → address → confirm
        └─ 4 (cancel)  → reset

order_status (active pagination)
  ├─ 1 (see more) → next page of active orders
  └─ 0 (back)     → main menu
```

## Session State

```typescript
interface SessionState {
  step: BotStep;                    // current FSM step
  items: OrderItemData[];           // products in cart
  subtotal: number;                 // sum without delivery
  total: number;                    // final total
  type: OrderType | null;           // delivery | pickup
  address: string | null;           // current delivery address
  lastAddress: string | null;       // last address used (from DB)
  deliveryNotes: string | null;     // optional delivery notes
  paymentMethod: PaymentMethod | null;
  currentProduct: Product | null;   // product being selected
  pendingItem: OrderItemData | null; // item being configured
  customerName: string | null;      // customer name
  orderStatusCache: Order[] | null; // cached active orders for pagination
  orderStatusPage: number;          // current pagination page (0-indexed)
}
```

## Dependency Rules (Layered Architecture)

Import arrows point **downward**. Never the other way.

```
Presentation (api/)
    ↓ imports
Application (bot/)
    ↓ imports
Domain (domain/)
    ← (pure — doesn't import from above)
Infrastructure (infrastructure/)
    ← (implementation — doesn't import from above)
```

### Rules

| Layer | Can import from | Cannot import from |
|------|-------------------|---------------------|
| `api/` (routes, controllers, middleware) | `bot/`, `domain/`, `types/` | `infrastructure/` directly (must go through Application) |
| `bot/` (WhatsAppBot, conversation logic) | `domain/`, `infrastructure/` | `api/` |
| `domain/` (Order, Product) | `types/` | `bot/`, `api/`, `infrastructure/` |
| `infrastructure/` (repos, adapters, DB) | `domain/`, `types/` | `api/`, `bot/` |

### Violation status

1. ✅ **`api/routes/orders.ts`** — No longer imports `OrderRepository` directly.
   - `src/application/OrderService.ts` was created to mediate between the route and the repository.
   - The route now imports `orderService` from `application/`.
2. ✅ **`api/routes/webhook.ts`** — No longer imports `getAdapter()` from Infrastructure.
   - `src/application/WebhookService.ts` was created to encapsulate the adapter and the bot.
   - The route now imports `webhookService` from `application/`.
3. ✅ **`bot/WhatsAppBot.ts`** — No longer imports repositories directly from Infrastructure.
   - `OrderRepositoryPort` and `ProductRepositoryPort` were created in `src/application/ports/`.
   - `OrderRepository` and `ProductRepository` implement their respective ports.
   - `WhatsAppBot` receives both repositories **injected via constructor**.
   - Concrete wiring is done in `src/composition.ts` (composition root).

### Long-term goal

Add a `src/application/` layer (Services) that mediates between `api/` and `infrastructure/`. Routes only talk to Services. Services talk to Repos + Domain.

```
api/routes/orders.ts ──→ application/OrderService.ts ──→ infrastructure/OrderRepository.ts
```

## Database (PostgreSQL)

### Table `users` (new — v1.4)

Unifies authentication for **admins and delivery drivers** in a single table. There is no separate `drivers` table — the `role` field differentiates user types.

| Column | Type | Notes |
|---------|------|-------|
| id | SERIAL PK | autoincrement |
| name | VARCHAR(100) | Full name |
| username | VARCHAR(50) UNIQUE | For login |
| password_hash | VARCHAR(255) | bcrypt — never plaintext |
| role | VARCHAR(20) | `admin` \| `delivery` |
| active | BOOLEAN | DEFAULT true — inactive users cannot login |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

Example records:

| username | role | Description |
|----------|------|-------------|
| `admin` | `admin` | Restaurant administrator |
| `juan.perez` | `delivery` | Delivery driver 1 |
| `andres.lopez` | `delivery` | Delivery driver 2 |

### Table `orders`
| Column | Type | Notes |
|---------|------|-------|
| id | VARCHAR(50) PK | UUID generated by Order.ts |
| customer_name | VARCHAR(100) | Customer name |
| customer_phone | VARCHAR(20) | Phone (clean) |
| type | VARCHAR(10) | delivery \| pickup |
| address | TEXT | nullable |
| payment_method | VARCHAR(10) | cash \| nequi |
| status | VARCHAR(20) | pending → confirmed → preparing → ready → delivered |
| notes | TEXT | nullable |
| delivery_proof_url | TEXT | nullable — delivery proof photo (new v1.4) |
| delivered_by | INTEGER FK | nullable — `users(id)` of driver who delivered the order (new v1.4) |
| assigned_driver | INTEGER FK | nullable — `users(id)` of driver assigned to deliver the order (new v1.5) |
| subtotal | INTEGER | in pesos |
| delivery_fee | INTEGER | 3000 or 0 |
| total | INTEGER | subtotal + fee |
| created_at | TIMESTAMPTZ | NOW() |
| estimated_ready_at | TIMESTAMPTZ | nullable |

### Table `order_items`
| Column | Type | Notes |
|---------|------|-------|
| id | SERIAL PK | autoincrement |
| order_id | VARCHAR(50) FK | CASCADE DELETE |
| product_id | VARCHAR(50) | catalog reference |
| quantity | INTEGER | > 0 |
| customizations | TEXT[] | array of strings |
| notes | TEXT | nullable |
| unit_price | INTEGER | unit price |
