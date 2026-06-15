# Testing Guide — Shanti Food Bot

## Stack

- **Framework**: [Vitest](https://vitest.dev/) v4
- **HTTP testing**: [Supertest](https://github.com/ladjs/supertest)
- **Coverage**: `@vitest/coverage-v8`

## Comandos

```bash
npm test                # corre todos los tests una vez
npm run test:watch      # modo watch (re-corre al guardar)
npm run test:coverage   # genera reporte de cobertura en /coverage
```

## Estructura

```
tests/
  unit/
    Order.test.ts          # domain model: Order, OrderItem, Customer
    Product.test.ts        # catálogo: getProductById, getProductByName, etc.
    WhatsAppBot.test.ts    # flujos conversacionales del bot (repo mockeado)
  integration/
    routes.test.ts         # rutas Express via supertest (repo mockeado)
```

## Arquitectura de tests

### Tests unitarios del bot

`WhatsAppBot` recibe el repositorio por constructor (inyección de dependencias):

```ts
const repo = makeRepo(); // mock sin DB
const bot = new WhatsAppBot(repo);
```

La función `makeRepo()` en `WhatsAppBot.test.ts` crea un objeto con todos los métodos de `OrderRepository` mockeados con `vi.fn()`. Esto permite testear todos los flujos conversacionales sin necesidad de PostgreSQL.

### Tests de integración

Las rutas Express se testean con `supertest` usando la factory `createApp()` de `src/app.ts` (separada del `startServer()` de `src/index.ts`). El repositorio se mockea a nivel de módulo con `vi.mock(...)`.

```ts
import { createApp } from '../../src/app.js';
const app = createApp(); // sin DB, sin puerto
```

### Lo que NO cubren estos tests (requeriría E2E con DB real)

- `OrderRepository` contra PostgreSQL
- `PATCH /api/v1/orders/:id` con orden existente
- `GET /api/v1/orders/stats/dashboard`
- Persistencia real entre requests

---

## Protocolo TDD para bugs

Cuando aparece un bug en producción, el flujo obligatorio es:

### 🔴 RED — test primero

Escribir un test que **reproduzca el bug exacto** antes de modificar cualquier código. El test debe fallar.

```ts
it('does not crash when ordering a product without customization options (regression)', async () => {
  // setup que reproduce el escenario del bug
  await bot.handleMessage(PHONE, msg('7')); // Coca-Cola — sin customizaciones
  const res = await bot.handleMessage(PHONE, msg('1'));
  expect(res).toContain('Agregado'); // falla porque el bug existe
});
```

### 🟢 GREEN — mínimo fix

Implementar el cambio mínimo para que el test pase. Sin over-engineering.

### 🔵 REFACTOR

Si el fix ensució algo, limpiar sin romper tests.

### Regla

> **Nunca mergear un fix de bug sin su test de regresión.**

---

## Ejemplo real: bug `pendingItem null` (15 Jun 2026)

**Error en producción:**
```
TypeError: Cannot set properties of null (setting 'quantity')
    at WhatsAppBot.handleQuantity
```

**Causa:** `handleProductSelection` saltaba a `step = 'quantity'` para productos sin customizaciones (bebidas) sin inicializar `session.pendingItem`.

**Test de regresión** (`tests/unit/WhatsAppBot.test.ts`):
```ts
it('does not crash when ordering a product without customization options (regression)', async () => {
  await bot.handleMessage(PHONE, msg('hola'));
  await bot.handleMessage(PHONE, msg('2'));
  await bot.handleMessage(PHONE, msg('Carlos'));
  await bot.handleMessage(PHONE, msg('7')); // Coca-Cola 400ml
  const res = await bot.handleMessage(PHONE, msg('1'));
  expect(res).toContain('Agregado');
  expect(res).toContain('Coca-Cola');
});
```

**Fix** (`src/bot/WhatsAppBot.ts`, `handleProductSelection`):
```ts
} else {
  session.pendingItem = {   // ← esto faltaba
    productId: product.id,
    quantity: 0,
    customizations: [],
    unitPrice: product.price,
    preparationMinutes: product.preparationMinutes,
  };
  session.step = 'quantity';
}
```
