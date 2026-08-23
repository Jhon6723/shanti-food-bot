# 🍚 Arrocería Shanti - WhatsApp Bot

**Shanti Food** is a complete ordering system for a rice restaurant (Arrocería Shanti). Customers place orders entirely through a **WhatsApp conversational bot** — no app to install, no website to visit, just a chat. The bot guides them through the menu, takes their delivery/pickup details, handles payments (cash or Nequi), and sends real-time order status updates.

On the operations side, an **admin PWA dashboard** lets staff manage incoming orders, update statuses, and view sales reports — all in real time via Server-Sent Events (SSE), with audio alerts for new orders.

The system is built with **Spec Driven Development** in **TypeScript** as a monorepo: an Express backend (REST API + WhatsApp bot) and a React + Vite frontend. It uses a **provider-agnostic adapter pattern** for WhatsApp, so it can run with either the official Meta Cloud API or a self-hosted OpenWA gateway — no code changes needed, just environment variables.

### Key highlights

- **WhatsApp-first**: The entire customer experience happens in a chat — menu browsing, ordering, payment, and tracking
- **Real-time admin**: SSE-powered dashboard with instant order notifications and sound alerts
- **Self-hostable**: Run your own WhatsApp gateway with OpenWA — no Meta Business account required
- **Spec-driven**: API contracts and conversational flows are designed before implementation (`specs/`)
- **Production-ready**: Deployed on Hetzner with Coolify, Docker Compose, PostgreSQL, and graceful shutdown handling

## Architecture

```
specs/                    # Specifications first
├── openapi.yaml         # API REST specification
├── whatsapp-flows.md    # Conversational flows
├── whatsapp-adapter.md  # Multi-provider adapter spec
└── admin-dashboard.md   # Admin PWA spec

src/                      # Backend (Express + TypeScript)
├── types/               # Shared types (strong typing)
├── domain/              # Pure business logic
│   └── models/
│       ├── Order.ts     # Order entity
│       └── Product.ts   # Product catalog
├── api/                 # REST API (implements specs)
│   └── routes/
│       ├── orders.ts
│       ├── products.ts
│       └── webhook.ts
├── bot/                 # WhatsApp bot logic
│   └── WhatsAppBot.ts   # Conversational flows
└── infrastructure/      # PostgreSQL + repositories + WhatsApp adapters
    ├── database/
    ├── repositories/
    └── whatsapp/        # Meta / OpenWA adapter pattern

admin/                    # Frontend (React + Vite PWA)
├── src/
│   ├── hooks/           # useOrders, SSE hooks
│   ├── lib/             # API client, types
│   └── components/
└── public/              # PWA assets, sounds

docs/                     # Project documentation (see below)
```

## Technologies

- **TypeScript** — Static typing throughout the project
- **Express** — REST API
- **PostgreSQL** — Persistent database
- **React + Vite** — Admin PWA frontend
- **Server-Sent Events (SSE)** — Real-time order updates
- **OpenWA / Meta Cloud API** — Pluggable WhatsApp providers
- **Docker Compose** — Service orchestration

## Features

- **WhatsApp Orders**: Complete conversational flow
- **Delivery and Pickup**: Two supported modes
- **Payments**: Cash on delivery or Nequi
- **Auto-confirmation**: Simple orders (<$50k) auto-confirmed
- **Order status**: Real-time queries with pagination
- **Admin Dashboard**: PWA with real-time updates via SSE, order management, sales reports
- **Multi-provider WhatsApp**: Switch between Meta Cloud API and OpenWA via env vars
- **Persistence**: PostgreSQL with Docker

## Menu (image-based)

| Category | Products | Prices |
|----------|----------|--------|
| Chinese Rice | Chicken, Pork, Shrimp, Special | $18k - $28k |
| Trays | Paisa, Chicken | $20k - $22k |
| Drinks | Coca-Cola, Juices | $4k - $8k |

Delivery: **$3,000** additional  
Estimated time: **25-30 minutes**

## Quick Start (Docker Compose)

```bash
# Start PostgreSQL + Bot
docker-compose up -d

# View logs
docker-compose logs -f app
```

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
# Edit .env with your credentials (PostgreSQL)

# 3. Create database (if not using Docker)
# Make sure PostgreSQL is running locally

# 4. Start in development
npm run dev

# 5. Or build and run in production
npm run build
npm start
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/products` | Full menu |
| POST | `/api/v1/orders` | Create order |
| GET | `/api/v1/orders` | List orders |
| GET | `/api/v1/events` | SSE stream for real-time order updates |
| POST | `/api/v1/webhooks/whatsapp` | WhatsApp webhook (Meta / OpenWA) |
| GET | `/api/v1/webhooks/test` | Test bot |

## Test the Bot

```bash
# Initial greeting
curl "http://localhost:3000/api/v1/webhooks/test?phone=3123456789&message=hola"

# Place order via API
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer": {"name": "Juan", "phone": "3123456789"},
    "items": [{"productId": "arroz-pollo", "quantity": 2}],
    "type": "delivery",
    "address": "Carrera 45 #12-34",
    "paymentMethod": "cash"
  }'
```

## WhatsApp Provider Configuration

The bot uses an **adapter pattern** that abstracts the WhatsApp provider, so the core logic (order flows, conversational state, notifications) is provider-agnostic. **The same codebase works with or without a WhatsApp Business account** — which provider is active depends entirely on environment variables:

| Variable | Description |
|----------|-------------|
| `WHATSAPP_PROVIDER` | `meta` (Meta Cloud API) or `openwa` (self-hosted) |
| `WHATSAPP_PROVIDER_URL` | OpenWA gateway URL (e.g. `http://localhost:2785`) |
| `WHATSAPP_PROVIDER_API_KEY` | OpenWA API key |
| `WHATSAPP_OPENWA_SESSION` | OpenWA session UUID |
| `WHATSAPP_PROVIDER_WEBHOOK_SECRET` | Optional HMAC secret for webhook verification |

See [`specs/whatsapp-adapter.md`](./specs/whatsapp-adapter.md) for the full adapter specification.

### Option A: Meta Cloud API (WhatsApp Business)

Requires a Meta Business account and an approved WhatsApp number.

1. Create app at [developers.facebook.com](https://developers.facebook.com)
2. Configure WhatsApp Business API
3. Get Phone Number ID and Access Token
4. Configure webhook: `https://yourdomain.com/api/v1/webhooks/whatsapp`
5. Set `WHATSAPP_PROVIDER=meta` and add the Meta credentials to `.env`

### Option B: OpenWA (Self-Hosted, no Business account needed)

[OpenWA](https://github.com/rmyndharis/OpenWA) is a self-hosted WhatsApp gateway that exposes WhatsApp Web via Puppeteer/whatsapp-web.js. You link it with a **regular WhatsApp number** via QR code — no Meta Business account, no approval process, no per-message fees.

Set `WHATSAPP_PROVIDER=openwa` and follow the setup below. Full guide: [`docs/OPENWA.md`](./docs/OPENWA.md).

### Quick Setup

**1. Start the OpenWA gateway** (Docker):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
curl http://localhost:2785/health   # {"status":"ok"}
```

**2. Create and authenticate a session:**

```bash
curl -s -X POST http://localhost:2785/api/sessions \
  -H "X-API-Key: <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"name": "shanti-bot"}'
```

Open the dashboard at `http://localhost:2785`, click **Start**, and scan the QR code with WhatsApp (Settings → Linked devices → Link a device). Wait until status is `ready`.

> Use the session **UUID** (not the name) in `WHATSAPP_OPENWA_SESSION`.

**3. Register the webhook:**

```bash
curl -s -X POST "http://localhost:2785/api/sessions/<UUID>/webhooks" \
  -H "X-API-Key: <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<YOUR_DOMAIN>/api/v1/webhooks/whatsapp",
    "events": ["message.received"],
    "secret": "<WEBHOOK_SECRET>"
  }'
```

**4. Configure Shanti's `.env`:**

```env
WHATSAPP_PROVIDER=openwa
WHATSAPP_PROVIDER_URL=http://localhost:2785
WHATSAPP_PROVIDER_API_KEY=owa_k1_...
WHATSAPP_OPENWA_SESSION=<UUID>
WHATSAPP_PROVIDER_WEBHOOK_SECRET=<same secret as webhook>
```

Restart Shanti after changing `.env` (`tsx` doesn't hot-reload env vars).

### Production Notes

- **Don't deploy OpenWA via Coolify** — Puppeteer/Chromium needs Docker security flags (`--no-sandbox`, `cap-drop`, `seccomp`) that Coolify's UI doesn't expose. Run it with Docker Compose directly on the VPS.
- Keep `BIND_HOST=127.0.0.1` so the gateway only listens on localhost. Access the dashboard via SSH tunnel: `ssh -L 2785:localhost:2785 root@<IP>`.
- Pin `WWEBJS_WEB_VERSION` in `.env` to avoid breakages from WhatsApp Web updates.
- Sessions persist in `./data/sessions/` — you only scan the QR once. If the session disconnects, restart the container and re-scan.

### JID Routing

OpenWA uses different JID suffixes depending on whether the contact is saved:

| Suffix | Meaning |
|--------|---------|
| `@c.us` | Known phone number (in contacts) |
| `@lid` | Unknown user (not in contacts) |
| `@g.us` | Group |

The `OpenWAAdapter` preserves the original `chatId` from incoming webhooks and uses it for replies — it never reconstructs with `@c.us` for `@lid` users (which would cause 500 errors).

## Documentation

All project documentation lives in [`docs/`](./docs):

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System architecture, monorepo structure, and component overview |
| [DEPLOYMENT.md](./docs/DEPLOYMENT.md) | Deployment guide with Docker Compose and Coolify |
| [OPENWA.md](./docs/OPENWA.md) | OpenWA self-hosted WhatsApp provider setup and operations |
| [PORTS_ADAPTERS.md](./docs/PORTS_ADAPTERS.md) | Hexagonal architecture: ports, adapters, and dependency inversion |
| [REALTIME_UPDATE_STRATEGIES.md](./docs/REALTIME_UPDATE_STRATEGIES.md) | Comparison of polling, long polling, SSE, and WebSockets; why SSE was chosen |
| [SECURITY.md](./docs/SECURITY.md) | Security audit findings, fixes, and recommendations |
| [KNOWN_ISSUES.md](./docs/KNOWN_ISSUES.md) | Known issues, workarounds, and roadmap |
| [TESTING.md](./docs/TESTING.md) | Testing stack (Vitest), running tests, and coverage |

## Spec Driven Development

This project follows the **specs-first** principle:

1. **Design specs**: `openapi.yaml` defines API contracts
2. **Design flows**: `whatsapp-flows.md` defines conversational UX
3. **Implement domain**: Typed models that fulfill specs
4. **Implement infrastructure**: API and bot on top of domain

## License

MIT
