# 🍚 Arrocería Shanti - WhatsApp Bot

WhatsApp bot for rice restaurant order management, designed with **Spec Driven Development** in **TypeScript**.

## Architecture

```
specs/                    # Specifications first
├── openapi.yaml         # API REST specification
└── whatsapp-flows.md    # Conversational flows

src/
├── types/               # Shared types (strong typing)
│   └── index.ts
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
└── infrastructure/      # PostgreSQL + repositories
    ├── database/
    │   └── connection.ts
    └── repositories/
        └── OrderRepository.ts
```

## Technologies

- **TypeScript** — Static typing throughout the project
- **Express** — REST API
- **PostgreSQL** — Persistent database
- **Docker Compose** — Service orchestration

## Features

- **WhatsApp Orders**: Complete conversational flow
- **Delivery and Pickup**: Two supported modes
- **Payments**: Cash on delivery or Nequi
- **Auto-confirmation**: Simple orders (<$50k) auto-confirmed
- **Order status**: Real-time queries
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
| POST | `/api/v1/webhooks/whatsapp` | WhatsApp webhook |
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

## WhatsApp Business API Integration

To connect with real WhatsApp:

1. Create app at [developers.facebook.com](https://developers.facebook.com)
2. Configure WhatsApp Business API
3. Get Phone Number ID and Access Token
4. Configure webhook: `https://yourdomain.com/api/v1/webhooks/whatsapp`
5. Add variables to `.env`

## Spec Driven Development

This project follows the **specs-first** principle:

1. **Design specs**: `openapi.yaml` defines API contracts
2. **Design flows**: `whatsapp-flows.md` defines conversational UX
3. **Implement domain**: Typed models that fulfill specs
4. **Implement infrastructure**: API and bot on top of domain

## License

MIT
