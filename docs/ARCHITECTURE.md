# Arquitectura de Shanti Food Bot

## Vision General

Sistema de pedidos por WhatsApp para Arroceria Shanti. **Monorepo** con backend Express (existente) y frontend PWA de administración (en desarrollo). Construido con **Spec Driven Development** y **TypeScript**.

## Capas

```
┌─────────────────────────────────────────┐
│  Cliente WhatsApp                       │
│  (mensaje de texto)                     │
└──────────┬──────────────────────────────┘
           │ Webhook HTTPS
           ▼
┌─────────────────────────────────────────┐
│  WhatsApp Provider (configurable)       │
│  meta:   Meta Cloud API                 │
│  openwa: Gateway OpenWA (self-hosted)   │
└──────────┬──────────────────────────────┘
           │ POST /api/v1/webhooks/whatsapp
           ▼
┌─────────────────────────────────────────┐
│  Express API (src/api/routes/)          │
│  • webhook.ts  — recibe mensajes         │
│  • orders.ts   — CRUD pedidos (JWT)      │
│  • products.ts — listar menu             │
│  • auth.ts     — login + JWT (nuevo)     │
│  • drivers.ts  — CRUD usuarios (nuevo)   │
│  • /admin      — sirve PWA estática      │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  Bot Layer (src/bot/WhatsAppBot.ts)     │
│  Session management + conversational FSM  │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  Domain Layer (src/domain/models/)        │
│  • Order.ts   — entidad + reglas          │
│  • Product.ts — catalogo + busqueda       │
└──────────┬──────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────┐
│  Infrastructure Layer                     │
│  • OrderRepository.ts  — PostgreSQL       │
│  • UserRepository.ts   — PostgreSQL       │
│  • connection.ts       — Pool pg          │
│  • whatsapp/           — Adapter pattern  │
│    ├ adapter.ts         — Interfaz        │
│    ├ meta/MetaAdapter   — Meta Cloud API  │
│    └ openwa/OpenWA      — Gateway OpenWA  │
└─────────────────────────────────────────┘
```

## Estructura del Monorepo

```
shanti-food/
  src/                     ← backend Express
  tests/                   ← tests unitarios e integración
  admin/                   ← PWA admin (React + Vite)
  specs/                   ← SDD y OpenAPI
  docs/                    ← documentación
  package.json
  docker-compose.yml
  .env
```

Ver `specs/admin-dashboard.md §11` para la estructura detallada y configuración de Coolify.

## Despliegue (Hetzner + Coolify)

- Un solo servicio en Coolify
- Express compila y sirve el frontend estático desde `GET /admin`
- Build command: `npm run build` (compila `admin/` + TypeScript backend)
- Start command: `npm start`

## Flujo de Mensaje Entrante

1. Usuario envía mensaje al número WhatsApp conectado
2. El proveedor activo (`WHATSAPP_PROVIDER`) hace POST al webhook con payload JSON
3. `webhook.ts` obtiene el adapter via `getAdapter()` y verifica la firma (si hay secret)
4. `adapter.parseIncoming(req)` normaliza el payload a `WhatsAppWebhookPayload[]`
5. Llama `bot.handleMessage(phone, {text})`
6. Bot consulta/crea sesion en memoria (`Map<string, Session>`)
7. Segun `session.step`, ejecuta handler correspondiente
8. Genera respuesta de texto
9. `adapter.sendMessage(phone, text, {chatId})` envia respuesta via el proveedor activo
10. Guarda pedido en PostgreSQL al confirmar

Ver `specs/whatsapp-adapter.md` para detalle del patron Adapter.

## Flujo Conversacional (FSM)

```
null (bienvenida)
  ├─ "hola" → reset + welcomeMessage()
  ├─ "1/menu" → menu
  ├─ "2/pedido" → name (nuevo) | product (cliente recurrente)
  ├─ "3/estado" → checkOrderStatus() → [order_status si hay paginación]
  ├─ "4/humano" → conectar
  └─ "estado" (keyword) → checkOrderStatus() desde cualquier step

name → product → customization → quantity → add_more
  └─ 1 (si) → product
  └─ 2 (no) → delivery_type
        ├─ 1 (domicilio, con dir. previa) → address_confirm
        │     ├─ 1 (reusar) → delivery_notes → payment → confirm
        │     └─ 2 (nueva)  → address → delivery_notes → payment → confirm
        ├─ 1 (domicilio, sin dir. previa) → address → delivery_notes → payment → confirm
        └─ 2 (recoger) → payment → confirm

confirm
  ├─ 1 (confirmar) → guardar en DB → fin
  ├─ 2 (cancelar)  → reset
  └─ 3 (modificar) → modify
        ├─ 1 (agregar)   → product → ... → confirm (salta delivery_type si ya hay tipo)
        ├─ 2 (quitar)    → selección → confirm
        ├─ 3 (dirección) → address → confirm
        └─ 4 (cancelar)  → reset

order_status (paginación activa)
  ├─ 1 (ver más) → siguiente página de pedidos activos
  └─ 0 (volver)  → menú principal
```

## Session State

```typescript
interface SessionState {
  step: BotStep;                    // paso actual del FSM
  items: OrderItemData[];           // productos en carrito
  subtotal: number;                 // suma sin domicilio
  total: number;                    // total final
  type: OrderType | null;           // delivery | pickup
  address: string | null;           // dirección de entrega actual
  lastAddress: string | null;       // última dirección usada (desde DB)
  deliveryNotes: string | null;     // notas opcionales de entrega
  paymentMethod: PaymentMethod | null;
  currentProduct: Product | null;   // producto en selección
  pendingItem: OrderItemData | null; // item siendo configurado
  customerName: string | null;      // nombre del cliente
  orderStatusCache: Order[] | null; // pedidos activos cacheados para paginación
  orderStatusPage: number;          // página actual de paginación (0-indexed)
}
```

## Base de Datos (PostgreSQL)

### Tabla `users` (nueva — v1.4)

Unifica autenticación de **administradores y repartidores** en una sola tabla. No hay tabla `drivers` separada — el campo `role` diferencia los tipos de usuario.

| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | autoincrement |
| name | VARCHAR(100) | Nombre completo |
| username | VARCHAR(50) UNIQUE | Para login |
| password_hash | VARCHAR(255) | bcrypt — nunca texto plano |
| role | VARCHAR(20) | `admin` \| `delivery` |
| active | BOOLEAN | DEFAULT true — inactivo no puede hacer login |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

Ejemplos de registros:

| username | role | Descripción |
|----------|------|-------------|
| `admin` | `admin` | Administrador del restaurante |
| `juan.perez` | `delivery` | Repartidor 1 |
| `andres.lopez` | `delivery` | Repartidor 2 |

### Tabla `orders`
| Columna | Tipo | Notas |
|---------|------|-------|
| id | VARCHAR(50) PK | UUID generado por Order.ts |
| customer_name | VARCHAR(100) | Nombre del cliente |
| customer_phone | VARCHAR(20) | Telefono (limpio) |
| type | VARCHAR(10) | delivery \| pickup |
| address | TEXT | nullable |
| payment_method | VARCHAR(10) | cash \| nequi |
| status | VARCHAR(20) | pending → confirmed → preparing → ready → delivered |
| notes | TEXT | nullable |
| delivery_proof_url | TEXT | nullable — foto evidencia de entrega (nuevo v1.4) |
| delivered_by | INTEGER FK | nullable — `users(id)` del repartidor que entrego el pedido (nuevo v1.4) |
| subtotal | INTEGER | en pesos |
| delivery_fee | INTEGER | 3000 o 0 |
| total | INTEGER | subtotal + fee |
| created_at | TIMESTAMPTZ | NOW() |
| estimated_ready_at | TIMESTAMPTZ | nullable |

### Tabla `order_items`
| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | autoincrement |
| order_id | VARCHAR(50) FK | CASCADE DELETE |
| product_id | VARCHAR(50) | referencia al catalogo |
| quantity | INTEGER | > 0 |
| customizations | TEXT[] | array de strings |
| notes | TEXT | nullable |
| unit_price | INTEGER | precio unitario |
