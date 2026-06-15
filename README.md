# 🍚 Arrocería Shanti - WhatsApp Bot

Bot de WhatsApp para gestión de pedidos de arrocería, diseñado con **Spec Driven Development** en **TypeScript**.

## Arquitectura

```
specs/                    # Especificaciones primero
├── openapi.yaml         # API REST specification
└── whatsapp-flows.md    # Conversational flows

src/
├── types/               # Tipos compartidos (tipado fuerte)
│   └── index.ts
├── domain/              # Lógica de negocio pura
│   └── models/
│       ├── Order.ts     # Entidad pedido
│       └── Product.ts   # Catálogo de productos
├── api/                 # REST API (implementa specs)
│   └── routes/
│       ├── orders.ts
│       ├── products.ts
│       └── webhook.ts
├── bot/                 # Lógica del bot WhatsApp
│   └── WhatsAppBot.ts   # Flujos conversacionales
└── infrastructure/      # PostgreSQL + repositorios
    ├── database/
    │   └── connection.ts
    └── repositories/
        └── OrderRepository.ts
```

## Tecnologías

- **TypeScript** — Tipado estático en todo el proyecto
- **Express** — API REST
- **PostgreSQL** — Base de datos persistente
- **Docker Compose** — Orquestación de servicios

## Características

- **Pedidos por WhatsApp**: Flujo conversacional completo
- **Domicilio y Recogida**: Dos modalidades soportadas
- **Pagos**: Efectivo contra entrega o Nequi
- **Auto-confirmación**: Pedidos simples (<$50k) se confirman automáticamente
- **Estado de pedidos**: Consulta en tiempo real
- **Persistencia**: PostgreSQL con Docker

## Menú (basado en imágenes)

| Categoría | Productos | Precios |
|-----------|-----------|---------|
| Arroces Chinos | Pollo, Cerdo, Camarón, Especial | $18k - $28k |
| Bandejas | Paisa, Pollo | $20k - $22k |
| Bebidas | Coca-Cola, Jugos | $4k - $8k |

Domicilio: **$3,000** adicional  
Tiempo estimado: **25-30 minutos**

## Inicio Rápido (Docker Compose)

```bash
# Levantar PostgreSQL + Bot
docker-compose up -d

# Ver logs
docker-compose logs -f app
```

## Inicio Rápido (Local)

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales (PostgreSQL)

# 3. Crear base de datos (si no usas Docker)
# Asegúrate de tener PostgreSQL corriendo localmente

# 4. Iniciar en desarrollo
npm run dev

# 5. O compilar y correr en producción
npm run build
npm start
```

## API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/products` | Menú completo |
| POST | `/api/v1/orders` | Crear pedido |
| GET | `/api/v1/orders` | Listar pedidos |
| POST | `/api/v1/webhooks/whatsapp` | Webhook WhatsApp |
| GET | `/api/v1/webhooks/test` | Probar bot |

## Probar el Bot

```bash
# Saludo inicial
curl "http://localhost:3000/api/v1/webhooks/test?phone=3123456789&message=hola"

# Hacer pedido por API
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

## Integración WhatsApp Business API

Para conectar con WhatsApp real:

1. Crear app en [developers.facebook.com](https://developers.facebook.com)
2. Configurar WhatsApp Business API
3. Obtener Phone Number ID y Access Token
4. Configurar webhook: `https://tudominio.com/api/v1/webhooks/whatsapp`
5. Agregar variables a `.env`

## Spec Driven Development

Este proyecto sigue el principio **specs-first**:

1. **Diseñar specs**: `openapi.yaml` define contratos API
2. **Diseñar flujos**: `whatsapp-flows.md` define UX conversacional
3. **Implementar dominio**: Modelos tipados que cumplen specs
4. **Implementar infraestructura**: API y bot sobre el dominio

## Licencia

MIT
