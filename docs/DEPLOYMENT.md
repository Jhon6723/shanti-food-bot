# Guia de Despliegue

## Requisitos

- Docker + Docker Compose
- Node.js 22 (solo para desarrollo local sin Docker)
- Proveedor WhatsApp: Meta Cloud API **o** OpenWA (self-hosted) — ver `.env.example`

## Variables de Entorno

Copia `.env.example` a `.env` y completa. El proveedor activo se controla con `WHATSAPP_PROVIDER`:

```env
# PostgreSQL
POSTGRES_USER=shanti
POSTGRES_PASSWORD=shanti123
POSTGRES_DB=shanti_food
DATABASE_URL=postgres://shanti:shanti123@localhost:5433/shanti_food

# Proveedor: meta | openwa
WHATSAPP_PROVIDER=openwa
```

Ver las secciones de cada proveedor abajo para las variables específicas.

## Docker Compose (Recomendado)

```bash
# Levantar todo (PostgreSQL + Bot)
docker-compose up -d

# Ver logs
docker-compose logs -f app

# Reconstruir despues de cambios
docker-compose up -d --build

# Detener
docker-compose down
# Detener y borrar datos
docker-compose down -v
```

## Desarrollo Local (sin Docker)

```bash
# 1. Necesitas PostgreSQL corriendo localmente
#    o apunta DATABASE_URL a una base remota

# 2. Instalar dependencias
npm install

# 3. Ejecutar en modo dev (tsx watch)
npm run dev

# 4. O compilar y correr
npm run build
npm start
```

## Proveedores WhatsApp

### Proveedor: Meta Cloud API

Variables requeridas en `.env`:

```env
WHATSAPP_PROVIDER=meta
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_BUSINESS_ACCOUNT_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_VERIFY_TOKEN=...    # token de verificación (tú lo inventas)
WHATSAPP_APP_SECRET=...      # produccion: HMAC SHA-256
```

Registrar webhook en [Meta Developers](https://developers.facebook.com):
- **Callback URL**: `https://<tu-dominio>/api/v1/webhooks/whatsapp`
- **Verify Token**: el mismo valor de `WHATSAPP_VERIFY_TOKEN`
- **Suscribir a**: `messages`

### Proveedor: OpenWA (self-hosted)

Variables requeridas en `.env`:

```env
WHATSAPP_PROVIDER=openwa
WHATSAPP_PROVIDER_URL=http://localhost:2785
WHATSAPP_PROVIDER_API_KEY=owa_k1_...   # generada por OpenWA al iniciar
WHATSAPP_OPENWA_SESSION=<UUID>          # UUID de la sesion (no el nombre)
WHATSAPP_PROVIDER_WEBHOOK_SECRET=...   # produccion: HMAC SHA-256
```

Ver `docs/OPENWA.md` para la guía completa de setup del gateway.

---

## Exponer a Internet (Webhook)

Ambos proveedores requieren una URL pública con HTTPS para recibir webhooks.

### Opcion A: Cloudflare Tunnel (gratis, rapido)

```bash
# Instalar cloudflared
sudo apt-get install -y cloudflared

# Crear tunnel temporal (apunta al puerto de Shanti)
cloudflared tunnel --url http://localhost:3000

# Te dara una URL tipo:
# https://abc123.trycloudflare.com
```

Usa `https://abc123.trycloudflare.com/api/v1/webhooks/whatsapp` como URL de webhook en el proveedor.

### Opcion B: Hosting en la nube (produccion)

Plataformas recomendadas:
- **Railway** — `railway.app`, PostgreSQL incluido, despliegue automatico desde GitHub
- **Render** — `render.com`, tier gratis disponible
- **Fly.io** — `fly.io`, muy rapido, buen precio

En todas estas, configura `DATABASE_URL` con la conexion a PostgreSQL que te proveen.

## SSL en Produccion

El bot detecta automaticamente cuando usar SSL:

```typescript
// connection.ts
const isLocalOrDocker = /localhost|127\.0\.0\.1|db|postgres/.test(DATABASE_URL);
ssl: NODE_ENV === 'production' && !isLocalOrDocker ? { rejectUnauthorized: false } : false;
```

Si usas Railway/Render/Fly, `DATABASE_URL` apuntara a un hostname externo y SSL se activara automaticamente.

## Comandos Utiles

```bash
# Test bot localmente
curl "http://localhost:3000/api/v1/webhooks/test?phone=3123456789&message=hola"

# Crear pedido por API
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{"customer":{"name":"Juan","phone":"3123456789"},"items":[{"productId":"arroz-pollo","quantity":2}],"type":"delivery","address":"Carrera 45 #12-34","paymentMethod":"cash"}'

# Ver estadisticas
curl http://localhost:3000/api/v1/orders/stats/dashboard
```
