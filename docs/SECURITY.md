# Security Issues & Fixes

Security audit performed on 16/06/2026.

---

## Architecture context

The next project phase includes an **administration frontend** (dashboard) that will allow the restaurant administrator to:
- View and manage orders in real time
- Change order statuses
- View business statistics

This frontend will authenticate with **JWT** against the backend. Therefore, the `/api/v1/orders` routes will be protected by JWT instead of a simple API key.

---

## 🔴 Critical

### 1. Endpoint `/webhooks/test` without authentication

**File:** `src/api/routes/webhook.ts` — `GET /api/v1/webhooks/test`

**Problem:** Anyone on the internet can send messages to any phone number pretending to be that user. Allows spam, manipulation of other users' sessions, and enumeration of customer orders.

**Fix:** Protect with API key via header, or better yet, **remove in production** and leave only in development.

```typescript
// Only available in development environment
if (process.env.NODE_ENV !== 'production') {
  router.get('/test', async (req, res) => { /* ... */ });
}
```

---

### 2. Orders API without authentication → JWT (admin phase)

**File:** `src/api/routes/orders.ts`

**Problem:**
- `GET /api/v1/orders` — exposes all orders with customer names, phones, and addresses
- `PATCH /api/v1/orders/:id` — anyone can cancel or modify any order
- `GET /api/v1/orders/stats/dashboard` — internal business data is public

**Fix — Admin frontend phase:** JWT authentication against the `users` table in PostgreSQL. Credentials are stored hashed with `bcrypt` — never in plaintext or in environment variables.

```typescript
// src/api/routes/auth.ts — new login endpoint
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const user = await userRepository.findByUsername(username);
  if (!user || !user.active)
    return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid)
    return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '8h' }
  );
  res.json({ token, role: user.role });
});
```

```typescript
// src/api/middleware/auth.ts
import jwt from 'jsonwebtoken';

export function requireJWT(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token required' });
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as { userId: number; role: string };
    (req as any).user = payload; // available in handlers
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if ((req as any).user?.role !== role)
      return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}
```

```typescript
// src/index.ts
app.use('/api/v1/orders', requireJWT, ordersRouter);
app.use('/api/v1/users', requireJWT, requireRole('admin'), usersRouter);
app.use('/api/v1/auth', authRouter);
```

**Required environment variables:**
```
JWT_SECRET=<random-256-bit-string>
```

**Note 1:** `ADMIN_USER` / `ADMIN_PASSWORD` are no longer used. The initial admin is created via seed when initializing the DB (see seed section in `specs/admin-dashboard.md §9`).

**Note 2:** The WhatsApp webhook MUST NOT require JWT since Meta calls it automatically.

---

### 3. Meta webhook without HMAC signature verification

**File:** `src/api/routes/webhook.ts` — `POST /api/v1/webhooks/whatsapp`

**Problem:** The endpoint accepts any request without verifying that it actually comes from Meta. Someone can send fake payloads simulating WhatsApp messages.

**Fix:** Validate the `X-Hub-Signature-256` header that Meta includes in every request.

```typescript
import crypto from 'crypto';

function verifyMetaSignature(req: Request): boolean {
  const signature = req.headers['x-hub-signature-256'] as string;
  if (!signature) return false;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return false;
  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

router.post('/whatsapp', async (req, res) => {
  if (!verifyMetaSignature(req)) return res.sendStatus(403);
  // ... rest of handler
});
```

**Required environment variables:**
```
WHATSAPP_APP_SECRET=<app-secret-from-meta-developers>
```

---

## 🟡 Moderate

### 4. Error messages expose internal details

**Files:** `src/api/routes/orders.ts`, `src/api/routes/webhook.ts`

**Problem:** `catch` blocks return `(error as Error).message` directly to the client, exposing stack traces and PostgreSQL errors.

**Fix:** Log internally and return generic message.

```typescript
} catch (error) {
  console.error('[orders] Error:', error);
  res.status(500).json({ error: 'Internal server error' });
}
```

---

### 5. No rate limiting

**Problem:** A user can send thousands of messages in a row, exhausting server and database resources.

**Fix:** Use `express-rate-limit`.

```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit';

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,             // max 30 messages per minute per IP
  message: { error: 'Too many requests, try again later' },
});

app.use('/api/v1/webhooks/whatsapp', webhookLimiter);
```

---

### 6. No length limit on session inputs

**File:** `src/bot/WhatsAppBot.ts`

**Problem:** Fields like `session.address`, `session.customerName`, and `session.deliveryNotes` accept free text without length limits.

**Fix:**

```typescript
const MAX_INPUT = 500;
const text = message.text?.body.slice(0, MAX_INPUT).toLowerCase().trim() ?? '';
```

---

## Implementation priority

| Priority | Issue | Phase | Status |
|-----------|-------|------|--------|
| 🔴 1 | Disable `/webhooks/test` in production | Now | Pending |
| 🔴 2 | JWT (`users` table + bcrypt) on `/api/v1/orders` and `/api/v1/users` routes | Admin frontend phase | Pending |
| 🔴 3 | HMAC signature verification for Meta webhook | Now | Pending |
| 🟡 4 | Sanitize error messages in production | Now | Pending |
| 🟡 5 | Rate limiting by IP | Now | Pending |
| 🟡 6 | Length limit on session inputs | Now | Pending |
