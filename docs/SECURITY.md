# Security Issues & Fixes

Auditoría de seguridad realizada el 16/06/2026.

---

## Contexto de arquitectura

La siguiente fase del proyecto incluye un **frontend de administración** (dashboard) que permitirá al administrador del restaurante:
- Ver y gestionar pedidos en tiempo real
- Cambiar estados de órdenes
- Ver estadísticas del negocio

Este frontend se autenticará con **JWT** contra el backend. Por lo tanto, las rutas de `/api/v1/orders` pasarán a estar protegidas por JWT en lugar de API key simple.

---

## 🔴 Críticas

### 1. Endpoint `/webhooks/test` sin autenticación

**Archivo:** `src/api/routes/webhook.ts` — `GET /api/v1/webhooks/test`

**Problema:** Cualquier persona en internet puede enviar mensajes a cualquier número de teléfono simulando ser ese usuario. Permite spam, manipulación de sesiones ajenas y enumeración de pedidos de clientes.

**Fix:** Proteger con API key via header, o mejor aún, **eliminar en producción** y dejar solo en desarrollo.

```typescript
// Solo disponible en entorno de desarrollo
if (process.env.NODE_ENV !== 'production') {
  router.get('/test', async (req, res) => { /* ... */ });
}
```

---

### 2. API de órdenes sin autenticación → JWT (fase admin)

**Archivo:** `src/api/routes/orders.ts`

**Problema:**
- `GET /api/v1/orders` — expone todos los pedidos con nombres, teléfonos y direcciones de clientes
- `PATCH /api/v1/orders/:id` — cualquiera puede cancelar o modificar cualquier pedido
- `GET /api/v1/orders/stats/dashboard` — datos internos del negocio públicos

**Fix — Fase admin frontend:** Autenticación JWT contra tabla `users` en PostgreSQL. Las credenciales se almacenan hasheadas con `bcrypt` — nunca en texto plano ni en variables de entorno.

```typescript
// src/api/routes/auth.ts — nuevo endpoint de login
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  const user = await userRepository.findByUsername(username);
  if (!user || !user.active)
    return res.status(401).json({ error: 'Credenciales inválidas' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid)
    return res.status(401).json({ error: 'Credenciales inválidas' });

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
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as { userId: number; role: string };
    (req as any).user = payload; // disponible en handlers
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if ((req as any).user?.role !== role)
      return res.status(403).json({ error: 'Sin permisos suficientes' });
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

**Variables de entorno requeridas:**
```
JWT_SECRET=<string-aleatorio-256-bits>
```

**Nota 1:** `ADMIN_USER` / `ADMIN_PASSWORD` ya no se usan. El admin inicial se crea vía seed al inicializar la DB (ver sección de seed en `specs/admin-dashboard.md §9`).

**Nota 2:** El webhook de WhatsApp NO debe requerir JWT ya que Meta lo llama automáticamente.

---

### 3. Webhook de Meta sin verificación de firma HMAC

**Archivo:** `src/api/routes/webhook.ts` — `POST /api/v1/webhooks/whatsapp`

**Problema:** El endpoint acepta cualquier request sin verificar que proviene realmente de Meta. Alguien puede enviar payloads falsos simulando mensajes de WhatsApp.

**Fix:** Validar el header `X-Hub-Signature-256` que Meta incluye en cada request.

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
  // ... resto del handler
});
```

**Variables de entorno requeridas:**
```
WHATSAPP_APP_SECRET=<app-secret-de-meta-developers>
```

---

## 🟡 Moderadas

### 4. Mensajes de error exponen detalles internos

**Archivos:** `src/api/routes/orders.ts`, `src/api/routes/webhook.ts`

**Problema:** Los bloques `catch` retornan `(error as Error).message` directamente al cliente, exponiendo stack traces y errores de PostgreSQL.

**Fix:** Loggear internamente y retornar mensaje genérico.

```typescript
} catch (error) {
  console.error('[orders] Error:', error);
  res.status(500).json({ error: 'Error interno del servidor' });
}
```

---

### 5. Sin rate limiting

**Problema:** Un usuario puede enviar miles de mensajes seguidos, agotando recursos del servidor y la base de datos.

**Fix:** Usar `express-rate-limit`.

```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit';

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30,             // máx 30 mensajes por minuto por IP
  message: { error: 'Demasiadas solicitudes, intenta más tarde' },
});

app.use('/api/v1/webhooks/whatsapp', webhookLimiter);
```

---

### 6. Sin límite de longitud en inputs de sesión

**Archivo:** `src/bot/WhatsAppBot.ts`

**Problema:** Campos como `session.address`, `session.customerName` y `session.deliveryNotes` aceptan texto libre sin límite de longitud.

**Fix:**

```typescript
const MAX_INPUT = 500;
const text = message.text?.body.slice(0, MAX_INPUT).toLowerCase().trim() ?? '';
```

---

## Prioridad de implementación

| Prioridad | Issue | Fase | Estado |
|-----------|-------|------|--------|
| 🔴 1 | Deshabilitar `/webhooks/test` en producción | Ahora | Pendiente |
| 🔴 2 | JWT (tabla `users` + bcrypt) en rutas `/api/v1/orders` y `/api/v1/users` | Fase admin frontend | Pendiente |
| 🔴 3 | Verificación de firma HMAC del webhook Meta | Ahora | Pendiente |
| 🟡 4 | Sanitizar mensajes de error en producción | Ahora | Pendiente |
| 🟡 5 | Rate limiting por IP | Ahora | Pendiente |
| 🟡 6 | Límite de longitud en inputs de sesión | Ahora | Pendiente |
