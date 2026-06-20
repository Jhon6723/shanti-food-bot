# Testing Guide — Shanti Food Bot

## Stack

- **Framework**: [Vitest](https://vitest.dev/) v4
- **HTTP testing**: [Supertest](https://github.com/ladjs/supertest)
- **Coverage**: `@vitest/coverage-v8`

## Commands

```bash
npm test                # run all tests once
npm run test:watch      # watch mode (re-runs on save)
npm run test:coverage   # generates coverage report in /coverage
```

## Structure

```
tests/
  unit/
    Order.test.ts          # domain model: Order, OrderItem, Customer
    Product.test.ts        # catalog: getProductById, getProductByName, etc.
    WhatsAppBot.test.ts    # bot conversation flows (mocked repo)
  integration/
    routes.test.ts         # Express routes via supertest (mocked repo)
```

## Test Architecture

### Bot unit tests

`WhatsAppBot` receives the repository via constructor (dependency injection):

```ts
const repo = makeRepo(); // mock without DB
const bot = new WhatsAppBot(repo);
```

The `makeRepo()` function in `WhatsAppBot.test.ts` creates an object with all `OrderRepository` methods mocked with `vi.fn()`. This allows testing all conversation flows without needing PostgreSQL.

### Integration tests

Express routes are tested with `supertest` using the `createApp()` factory from `src/app.ts` (separated from `startServer()` in `src/index.ts`). The repository is mocked at the module level with `vi.mock(...)`.

```ts
import { createApp } from '../../src/app.js';
const app = createApp(); // no DB, no port
```

### What these tests DON'T cover (would require E2E with real DB)

- `OrderRepository` against PostgreSQL
- `PATCH /api/v1/orders/:id` with existing order
- `GET /api/v1/orders/stats/dashboard`
- Real persistence between requests

---

## TDD Protocol for Bugs

When a bug appears in production, the mandatory flow is:

### 🔴 RED — test first

Write a test that **reproduces the exact bug** before modifying any code. The test must fail.

```ts
it('does not crash when ordering a product without customization options (regression)', async () => {
  // setup that reproduces the bug scenario
  await bot.handleMessage(PHONE, msg('7')); // Coca-Cola — no customizations
  const res = await bot.handleMessage(PHONE, msg('1'));
  expect(res).toContain('Added'); // fails because the bug exists
});
```

### 🟢 GREEN — minimal fix

Implement the minimum change for the test to pass. No over-engineering.

### 🔵 REFACTOR

If the fix made things messy, clean up without breaking tests.

### Rule

> **Never merge a bug fix without its regression test.**

---

## Real example: `pendingItem null` bug (15 Jun 2026)

**Production error:**
```
TypeError: Cannot set properties of null (setting 'quantity')
    at WhatsAppBot.handleQuantity
```

**Cause:** `handleProductSelection` jumped to `step = 'quantity'` for products without customizations (drinks) without initializing `session.pendingItem`.

**Regression test** (`tests/unit/WhatsAppBot.test.ts`):
```ts
it('does not crash when ordering a product without customization options (regression)', async () => {
  await bot.handleMessage(PHONE, msg('hola'));
  await bot.handleMessage(PHONE, msg('2'));
  await bot.handleMessage(PHONE, msg('Carlos'));
  await bot.handleMessage(PHONE, msg('7')); // Coca-Cola 400ml
  const res = await bot.handleMessage(PHONE, msg('1'));
  expect(res).toContain('Added');
  expect(res).toContain('Coca-Cola');
});
```

**Fix** (`src/bot/WhatsAppBot.ts`, `handleProductSelection`):
```ts
} else {
  session.pendingItem = {   // ← this was missing
    productId: product.id,
    quantity: 0,
    customizations: [],
    unitPrice: product.price,
    preparationMinutes: product.preparationMinutes,
  };
  session.step = 'quantity';
}
```
