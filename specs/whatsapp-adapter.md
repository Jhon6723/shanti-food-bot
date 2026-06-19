# SDD — WhatsApp Provider Adapter
# Arrocería Shanti — Adapter de Proveedores de WhatsApp

**Versión:** 1.0  
**Fecha:** 2026-06-18  
**Tipo:** Backend Infrastructure — Adapter Pattern  
**Ámbito:** `src/infrastructure/whatsapp/`

---

## 1. Objetivo

Permitir que el bot de Shanti funcione con **múltiples proveedores de WhatsApp** sin modificar el dominio (`bot/`) ni la API (`api/routes/`). El adapter encapsula:

1. **Recepción de mensajes**: normalizar cualquier webhook entrante al formato interno del bot.
2. **Envío de mensajes**: abstraer el mecanismo de entrega (Meta Graph API, Evolution API, etc.).
3. **Verificación de seguridad**: validar la autenticidad del request (HMAC, API key, etc.).

El bot (`WhatsAppBot.ts`) debe seguir siendo **agnóstico** del proveedor.

---

## 2. Principio de Diseño

> **"El bot habla con un adapter, no con un proveedor."**

- El `webhook.ts` lee `WHATSAPP_PROVIDER` del entorno y delega todo al adapter correspondiente.
- El adapter se encarga de parsear el payload específico y enviar la respuesta.
- Agregar un nuevo proveedor = implementar la interfaz + registrarlo en la factory. Cero cambios en `bot/`.

---

## 3. Interfaz `WhatsAppAdapter`

```typescript
export interface WhatsAppAdapter {
  /** Nombre legible del proveedor (logs) */
  readonly name: string;

  /** Extrae y normaliza mensajes del body del webhook entrante */
  parseIncoming(req: Request): WhatsAppWebhookPayload[];

  /** Envía un mensaje de texto al número destino */
  sendMessage(to: string, text: string, options?: { chatId?: string }): Promise<void>;

  /** Valida autenticidad del request (opcional) */
  verifyRequest?(req: Request): boolean;
}
```

### `WhatsAppWebhookPayload` (formato interno normalizado)

```typescript
interface WhatsAppWebhookPayload {
  messageId: string;
  from: string;          // número limpio, ej: "573123456789"
  type: 'text' | 'interactive' | 'location' | 'order';
  text?: { body: string };
  interactive?: {
    type: string;
    buttonReply?: Record<string, unknown>;
    listReply?: Record<string, unknown>;
  };
  chatId?: string;       // JID original del proveedor (ej: "573...@lid", "573...@c.us")
}
```

---

## 4. Configuración por Entorno

| Variable | Requerida | Valor por defecto | Descripción |
|----------|-----------|-------------------|-------------|
| `WHATSAPP_PROVIDER` | No | `meta` | Proveedor activo: `meta` \| `openwa` |

### Meta (`meta`)

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `WHATSAPP_ACCESS_TOKEN` | Sí | Token de Meta Graph API |
| `WHATSAPP_PHONE_NUMBER_ID` | Sí | ID del número de teléfono registrado |
| `WHATSAPP_APP_SECRET` | Producción | Secreto para verificar HMAC-SHA256 |
| `WHATSAPP_VERIFY_TOKEN` | Sí (solo setup) | Token de verificación del webhook |
| `WHATSAPP_API_VERSION` | No | `v18.0` |

### OpenWA (`openwa`)

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `WHATSAPP_PROVIDER_URL` | Sí | URL base del gateway OpenWA (ej. `http://localhost:2785`) |
| `WHATSAPP_PROVIDER_API_KEY` | Sí | API key generada por OpenWA (`X-API-Key`) |
| `WHATSAPP_OPENWA_SESSION` | Sí | UUID de la sesión (no el nombre) — se obtiene del dashboard o `GET /api/sessions` |
| `WHATSAPP_PROVIDER_WEBHOOK_SECRET` | Producción | Secreto HMAC para verificar `x-openwa-signature` |

---

## 5. Implementaciones

### 5.1 `MetaAdapter`

**Ubicación:** `src/infrastructure/whatsapp/meta/MetaAdapter.ts`

**Responsabilidades:**
- Parsear payload anidado de Meta: `entry[].changes[].value.messages[]`.
- Normalizar número: eliminar prefijos no numéricos.
- Enviar mensajes vía `POST https://graph.facebook.com/{version}/{phoneNumberId}/messages`.
- Verificar firma HMAC-SHA256 (`x-hub-signature-256`).

**Formato de entrada (Meta):**
```json
{
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "id": "wamid.xxx",
          "from": "573123456789",
          "type": "text",
          "text": { "body": "Hola" }
        }]
      }
    }]
  }]
}
```

**Formato de salida (Meta):**
```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "573123456789",
  "type": "text",
  "text": { "body": "¡Bienvenido a Shanti!" }
}
```

### 5.2 `OpenWAAdapter`

**Ubicación:** `src/infrastructure/whatsapp/openwa/OpenWAAdapter.ts`
**Proyecto:** https://github.com/rmyndharis/OpenWA

**Responsabilidades:**
- Parsear payload de OpenWA: `event`, `data.from`, `data.body`.
- Solo procesar eventos `message.received` (ignorar `fromMe`).
- Normalizar número: extraer del JID (`573123456789@c.us` → `573123456789`).
- Enviar mensajes vía `POST /api/sessions/{session}/messages/send-text`.
- Autentica con header `X-API-Key`. Verifica HMAC `x-openwa-signature` si hay secreto.

**Formato de entrada (OpenWA):**
```json
{
  "event": "message.received",
  "sessionId": "6eaedbe9-ede0-40fc-b600-0c3760d877fd",
  "data": {
    "messageId": "3EB0F5A2...",
    "chatId": "178327646171353@lid",
    "from": "178327646171353@lid",
    "body": "Hola, quiero un arroz",
    "type": "text",
    "isLidSender": true,
    "senderPhone": "573123456789"
  }
}
```

> **Nota sobre LID → Phone:** OpenWA puede enviar `@lid` (Line ID) cuando el remitente no está en contactos. Si configuras `RESOLVE_LID_TO_PHONE=true` en OpenWA, el payload incluye `senderPhone` con el número real. El adapter usa `senderPhone` como `from` cuando está presente; de lo contrario, cae al LID crudo (útil para sesión conversacional pero no para guardar en DB).

**Formato de salida (OpenWA):**
```json
{
  "chatId": "178327646171353@lid",
  "text": "¡Bienvenido a Shanti!"
}
```

**Nota sobre JIDs:** OpenWA puede enviar `chatId` con sufijo `@c.us` (contacto en agenda) o `@lid` (usuario no guardado). El adapter preserva el `chatId` original del webhook — nunca lo reconstruye con `@c.us` si vino con `@lid`. Este valor se pasa en `options.chatId` a `sendMessage`.

---

## 6. Factory de Adapters

**Ubicación:** `src/infrastructure/whatsapp/index.ts`

```typescript
export function getAdapter(): WhatsAppAdapter {
  const provider = process.env.WHATSAPP_PROVIDER ?? 'meta';
  switch (provider) {
    case 'meta':
      return new MetaAdapter();
    case 'openwa':
      return new OpenWAAdapter();
    default:
      throw new Error(`Unknown WhatsApp provider: ${provider}`);
  }
}
```

---

## 7. Cambios en `webhook.ts`

El router de webhook debe quedar **genérico**:

```typescript
const adapter = getAdapter();

router.post('/whatsapp', async (req, res) => {
  res.sendStatus(200);
  if (adapter.verifyRequest && !adapter.verifyRequest(req)) return;

  const payloads = adapter.parseIncoming(req);
  for (const payload of payloads) {
    const response = await bot.handleMessage(payload.from, {
      type: payload.type as 'text',
      text: payload.text,
      interactive: payload.interactive,
    });
    await adapter.sendMessage(payload.from, response, payload.chatId ? { chatId: payload.chatId } : undefined);
  }
});
```

El endpoint `GET /webhooks/whatsapp` (verificación de suscripción) puede quedar en `MetaAdapter` como método adicional si es necesario, o mantenerse en `webhook.ts` condicionalmente.

---

## 8. Estructura de Carpetas

```
src/infrastructure/whatsapp/
├── adapter.ts              # Interfaz WhatsAppAdapter
├── index.ts                # Factory getAdapter()
├── meta/
│   ├── MetaAdapter.ts      # Implementación Meta
│   └── parseWebhook.ts     # Helper: extraer payload Meta
└── openwa/
    └── OpenWAAdapter.ts     # Implementación OpenWA
```

---

## 9. Reglas de Normalización

1. **Número de teléfono**:
   - Meta envía `573123456789` (limpia).
   - OpenWA envía JID `573123456789@c.us` → extraer parte antes de `@`.
   - Siempre retornar dígitos sin espacios ni prefijos `+`.

2. **Mensaje de texto**:
   - Meta: `message.text.body`.
   - OpenWA: `data.body`.
   - Fallback a string vacío si no existe.

3. **ID del mensaje**:
   - Meta: `message.id`.
   - OpenWA: `data.messageId`.
   - Usado para logging/trazabilidad.

---

## 10. Extensión Futura

Para agregar un nuevo proveedor (ej. WPPConnect, Evolution API, Twilio):

1. Crear clase que implemente `WhatsAppAdapter`.
2. Agregar caso en el `switch` de `getAdapter()`.
3. Documentar variables de entorno en este archivo.
4. **No modificar** `bot/WhatsAppBot.ts` ni `api/routes/webhook.ts`.

---

## 11. Referencias

- `docs/ARCHITECTURE.md` § Flujo de Mensaje Entrante
- `specs/openapi.yaml` — Endpoints de webhook
- `src/bot/WhatsAppBot.ts` — Lógica conversacional (agnóstica)
- OpenWA: https://github.com/rmyndharis/OpenWA
