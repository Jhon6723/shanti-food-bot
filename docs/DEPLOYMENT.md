# Guia de Despliegue

## Requisitos

- Docker + Docker Compose
- Node.js 22 (solo para desarrollo local sin Docker)
- Cuenta Meta Developers con WhatsApp Cloud API

## Variables de Entorno

Copia `.env.example` a `.env` y completa:

```env
# PostgreSQL (cambia las credenciales en produccion)
POSTGRES_USER=shanti
POSTGRES_PASSWORD=shanti123
POSTGRES_DB=shanti_food
DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}

# WhatsApp (obtenidas de developers.facebook.com)
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_BUSINESS_ACCOUNT_ID=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_VERIFY_TOKEN=...(inventa uno secreto)
```

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

## Exponer a Internet (Webhook)

Meta requiere una URL publica con HTTPS para el webhook.

### Opcion A: Cloudflare Tunnel (gratis, rapido)

```bash
# Instalar cloudflared
sudo apt-get install -y cloudflared

# Crear tunnel temporal
cloudflared tunnel --url http://localhost:3000

# Te dara una URL tipo:
# https://abc123.trycloudflare.com
```

Configura en Meta:
- **Callback URL**: `https://abc123.trycloudflare.com/api/v1/webhooks/whatsapp`
- **Verify Token**: el mismo valor de `WHATSAPP_VERIFY_TOKEN`

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
