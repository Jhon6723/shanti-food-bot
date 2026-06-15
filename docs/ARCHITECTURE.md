# Arquitectura de Shanti Food Bot

## Vision General

Sistema de pedidos por WhatsApp para Arroceria Shanti. Construido con **Spec Driven Development** y migrado a **TypeScript**.

## Capas

```
┌─────────────────────────────────────────┐
│  Cliente WhatsApp                       │
│  (mensaje de texto)                     │
└──────────┬──────────────────────────────┘
           │ Webhook HTTPS
           ▼
┌─────────────────────────────────────────┐
│  Meta WhatsApp Cloud API                │
│  (valida, reenvia payload JSON)        │
└──────────┬──────────────────────────────┘
           │ POST /api/v1/webhooks/whatsapp
           ▼
┌─────────────────────────────────────────┐
│  Express API (src/api/routes/)          │
│  • webhook.ts  — recibe mensajes         │
│  • orders.ts  — CRUD pedidos             │
│  • products.ts — listar menu            │
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
│  • connection.ts       — Pool pg          │
│  • WhatsAppSender.ts   — Meta API out     │
└─────────────────────────────────────────┘
```

## Flujo de Mensaje Entrante

1. Usuario envia mensaje a numero de Meta
2. Meta hace POST al webhook con payload JSON
3. `webhook.ts` parsea `entry[].changes[].value.messages[]`
4. Extrae `message.from` (telefono) y `message.text.body`
5. Llama `bot.handleMessage(phone, {text})`
6. Bot consulta/crea sesion en memoria (`Map<string, Session>`)
7. Segun `session.step`, ejecuta handler correspondiente
8. Genera respuesta de texto
9. `sendWhatsAppMessage()` envia respuesta via Meta API
10. Guarda pedido en PostgreSQL al confirmar

## Flujo Conversacional (FSM)

```
null (bienvenida)
  ├─ "hola" → reset + welcomeMessage()
  ├─ "1/menu" → menu
  ├─ "2/pedido" → name (nuevo)
  ├─ "3/estado" → checkOrderStatus()
  └─ "4/humano" → conectar

name → product → customization → quantity → add_more
  └─ 1 (si) → product
  └─ 2 (no) → delivery_type
        ├─ 1 (domicilio) → address → payment → confirm
        └─ 2 (recoger) → payment → confirm
```

## Session State

```typescript
interface SessionState {
  step: BotStep;              // paso actual
  items: OrderItemData[];       // productos en carrito
  subtotal: number;             // suma sin domicilio
  total: number;                // total final
  type: OrderType | null;       // delivery | pickup
  address: string | null;       // direccion entrega
  paymentMethod: PaymentMethod | null; // cash | nequi
  currentProduct: Product | null;      // producto seleccionado
  pendingItem: OrderItemData | null;   // item en edicion
  customerName: string | null;         // nombre cliente (nuevo)
}
```

## Base de Datos (PostgreSQL)

### Tabla `orders`
| Columna | Tipo | Notas |
|---------|------|-------|
| id | VARCHAR(50) PK | UUID generado por Order.ts |
| customer_name | VARCHAR(100) | Nombre del cliente |
| customer_phone | VARCHAR(20) | Telefono (limpio) |
| type | VARCHAR(10) | delivery | pickup |
| address | TEXT | nullable |
| payment_method | VARCHAR(10) | cash | nequi |
| status | VARCHAR(20) | pending → confirmed → preparing → ready → delivered |
| notes | TEXT | nullable |
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
