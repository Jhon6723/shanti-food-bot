# Guía OpenWA — Proveedor WhatsApp Self-Hosted

OpenWA es un gateway REST que expone WhatsApp Web vía Puppeteer/whatsapp-web.js.
Permite enviar y recibir mensajes sin cuenta de Meta Business.

- **Repo**: https://github.com/rmyndharis/OpenWA
- **Dashboard**: `http://localhost:2785` (por defecto)

---

## 1. Requisitos

- Docker + Docker Compose
- Chromium disponible en el contenedor (el `Dockerfile` lo instala)
- Puerto `2785` libre en el host
- URL pública HTTPS para el webhook (Cloudflare Tunnel o similar)

---

## 2. Levantar el Gateway

```bash
# Desde el directorio de OpenWA (~/openwa por defecto)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Verifica que levantó:

```bash
curl http://localhost:2785/health
# {"status":"ok"}
```

---

## 3. Crear y Autenticar una Sesión

### 3.1 Crear la sesión

```bash
curl -s -X POST http://localhost:2785/api/sessions \
  -H "X-API-Key: <TU_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"name": "shanti-bot"}'
```

Respuesta:

```json
{
  "id": "6eaedbe9-ede0-40fc-b600-0c3760d877fd",
  "name": "shanti-bot",
  "status": "stopped"
}
```

> **Importante:** usa el campo `id` (UUID) en `WHATSAPP_OPENWA_SESSION`, no el `name`.

### 3.2 Iniciar la sesión y escanear QR

1. Abre el dashboard: `http://localhost:2785`
2. Haz clic en **Start** junto a `shanti-bot`
3. Escanea el código QR con WhatsApp → **Dispositivos vinculados** → **Vincular dispositivo**
4. Espera a que el estado cambie a **ready**

### 3.3 Verificar estado

```bash
curl -s http://localhost:2785/api/sessions \
  -H "X-API-Key: <TU_API_KEY>"
```

El campo `status` debe ser `"ready"`.

---

## 4. Registrar el Webhook

OpenWA entrega webhooks por sesión. Registra el webhook **después** de que la sesión esté `ready`.

### 4.1 Registrar

```bash
curl -s -X POST "http://localhost:2785/api/sessions/<UUID>/webhooks" \
  -H "X-API-Key: <TU_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<TU_TUNNEL>/api/v1/webhooks/whatsapp",
    "events": ["message.received"],
    "secret": "<WEBHOOK_SECRET>"
  }'
```

- `url`: URL pública HTTPS de Shanti (Cloudflare Tunnel o dominio en producción)
- `events`: solo `["message.received"]` para evitar llamadas innecesarias
- `secret`: mismo valor que `WHATSAPP_PROVIDER_WEBHOOK_SECRET` en `.env`

### 4.2 Verificar registro

```bash
curl -s "http://localhost:2785/api/sessions/<UUID>/webhooks" \
  -H "X-API-Key: <TU_API_KEY>"
```

### 4.3 Eliminar y recrear (si necesitas cambiar la URL o el secret)

```bash
# Eliminar
curl -s -X DELETE "http://localhost:2785/api/sessions/<UUID>/webhooks/<WEBHOOK_ID>" \
  -H "X-API-Key: <TU_API_KEY>"

# Recrear con los nuevos datos
curl -s -X POST "http://localhost:2785/api/sessions/<UUID>/webhooks" \
  -H "X-API-Key: <TU_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{ "url": "...", "events": ["message.received"], "secret": "..." }'
```

---

## 5. Variables de Entorno en Shanti

```env
WHATSAPP_PROVIDER=openwa
WHATSAPP_PROVIDER_URL=http://localhost:2785
WHATSAPP_PROVIDER_API_KEY=owa_k1_...
WHATSAPP_OPENWA_SESSION=6eaedbe9-ede0-40fc-b600-0c3760d877fd   # UUID, no el nombre
WHATSAPP_PROVIDER_WEBHOOK_SECRET=<mismo secret del webhook>
```

> Después de cambiar el `.env`, reinicia Shanti: `Ctrl+C` + `npm run dev` (tsx no recarga `.env` automáticamente).

---

## 6. Verificación Completa (Smoke Test)

```bash
# 1. OpenWA responde
curl http://localhost:2785/health

# 2. Sesión activa
curl -s http://localhost:2785/api/sessions \
  -H "X-API-Key: <API_KEY>" | python3 -c "import sys,json; [print(s['name'], s['status']) for s in json.load(sys.stdin)]"

# 3. Webhook registrado
curl -s "http://localhost:2785/api/sessions/<UUID>/webhooks" \
  -H "X-API-Key: <API_KEY>"

# 4. Shanti responde
curl "http://localhost:3000/api/v1/webhooks/test?phone=3123456789&message=hola"

# 5. Envío directo de mensaje (reemplaza <UUID> y <CHAT_ID>)
curl -s -X POST "http://localhost:2785/api/sessions/<UUID>/messages/send-text" \
  -H "X-API-Key: <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"chatId": "573123456789@c.us", "text": "Test"}'
```

---

## 7. Notas sobre JIDs

WhatsApp usa identificadores JID para direccionar mensajes:

| Sufijo | Uso |
|--------|-----|
| `@c.us` | Número de teléfono conocido (en agenda) |
| `@lid` | Usuario no guardado como contacto |
| `@g.us` | Grupo |

**El `OpenWAAdapter` preserva siempre el `chatId` original** del webhook entrante para usarlo en el envío. No reconstruye con `@c.us` si el mensaje llegó con `@lid` — eso causaría error 500.

---

## 8. Solución de Problemas

### Sesión "not active" pese a estar "ready" en el dashboard

El UUID en `WHATSAPP_OPENWA_SESSION` no coincide con el de la sesión activa.

```bash
# Obtener UUID real
curl -s http://localhost:2785/api/sessions \
  -H "X-API-Key: <API_KEY>" | python3 -c "import sys,json; [print(s['id'], s['name']) for s in json.load(sys.stdin)]"
```

Actualiza `.env` y reinicia Shanti.

### Error 500 al enviar mensaje

Causa más común: `chatId` con sufijo incorrecto (ej. `@c.us` para un usuario `@lid`).
El adapter usa el `chatId` del webhook, así que el error suele indicar que la sesión se desconectó.

**Solución:** Reinicia la sesión en el dashboard y vuelve a escanear el QR.

### Chromium no encontrado en el contenedor

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

El `Dockerfile` instala Chromium y configura `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`.

### El webhook no llega a Shanti (tunnel expirado)

Los tunnels de Cloudflare temporales cambian de URL al reiniciar. Cuando cambie:

```bash
# 1. Eliminar webhook viejo (ver sección 4.3)
# 2. Registrar con la nueva URL del tunnel
```

---

## 9. Despliegue en Producción (Hetzner)

### ¿Coolify o Docker Compose directo?

**No uses Coolify para OpenWA.** Puppeteer/Chromium requiere flags de seguridad Docker
(`cap-drop`, `--no-sandbox`, `seccomp`) que Coolify no expone en su UI y que pueden causar
fallos silenciosos o crasheos del navegador headless.

Arquitectura recomendada en Hetzner:

```
┌──────────────────────────── Hetzner VPS ───────────────────────────┐
│                                                                      │
│  ┌─────────────────────┐      ┌──────────────────────────────────┐  │
│  │  Coolify            │      │  Docker Compose (manual)         │  │
│  │  └ Shanti Bot       │─────▶│  └ OpenWA Gateway :2785          │  │
│  │    (Express + PG)   │ HTTP │    (Puppeteer + whatsapp-web.js) │  │
│  └─────────────────────┘      └──────────────────────────────────┘  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

Shanti se conecta a OpenWA por red interna del servidor (`http://localhost:2785`).

---

### 9.1 Requisitos del Servidor

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| RAM | 2 GB | 4 GB |
| CPU | 1 vCPU | 2 vCPU |
| Disco | 20 GB | 40 GB |
| OS | Ubuntu 22.04 | Ubuntu 24.04 |

> Chromium en modo headless consume ~300–500 MB de RAM por sesión activa.
> Con Shanti + PostgreSQL + OpenWA, 2 GB puede ser justo; 4 GB es cómodo.

---

### 9.2 Preparar el Servidor

```bash
# Conectar al servidor
ssh root@<IP_HETZNER>

# Instalar Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Instalar Docker Compose plugin
apt-get install -y docker-compose-plugin

# Verificar
docker --version
docker compose version
```

---

### 9.3 Subir tu Proyecto Local

Ya tienes un `docker-compose.dev.yml` y `.env` funcionando localmente. Simplemente cópialos
al servidor — no necesitas crear archivos nuevos desde cero.

```bash
# Desde tu máquina local
scp -r ~/openwa root@<IP_HETZNER>:/opt/openwa
ssh root@<IP_HETZNER>

# En el servidor
cd /opt/openwa

# Revisa tu .env: debe tener al menos estas configuraciones para producción
# NODE_ENV=production
# PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage,--disable-gpu
# WWEBJS_WEB_VERSION=...  (pined, ver tu .env local)
```

Si quieres, añade en tu `.env` del servidor:

```env
# Producción: fija la versión de WhatsApp Web para evitar roturas por actualizaciones
WWEBJS_WEB_VERSION=2.3000.1023204257
# Descomenta si el Dockerfile de OpenWA necesita la ruta explícita
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

> `--disable-dev-shm-usage` es crítico en VPS con poca RAM — evita que Chromium crashee
> al quedarse sin espacio en `/dev/shm`.

---

### 9.4 Levantar OpenWA en Producción

```bash
cd /opt/openwa

# Primera vez: construir y levantar (usa tu docker-compose.dev.yml existente)
docker compose -f docker-compose.dev.yml up -d --build

# Ver logs
docker compose -f docker-compose.dev.yml logs -f

# Reiniciar
docker compose -f docker-compose.dev.yml restart openwa

# Detener
docker compose -f docker-compose.dev.yml down
```

> El compose ya trae `cap_drop`, `cap_add`, `read_only`, y monta `./data:/app/data` para
> persistencia de sesión. Solo asegúrate de que `BIND_HOST` en `.env` sea `127.0.0.1`
> (por defecto ya lo es) para que el gateway no escuche en la interfaz pública.

---

### 9.5 Crear y Autenticar la Sesión en Producción

La sesión necesita escaneo de QR **una vez**. Después persiste en el volumen `./data/sessions`.

```bash
# 1. Obtener la API key de los logs al iniciar
docker compose -f docker-compose.dev.yml logs openwa | grep "API Key"

# 2. Crear la sesión
curl -s -X POST http://localhost:2785/api/sessions \
  -H "X-API-Key: <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"name": "shanti-bot"}'

# 3. Iniciar y obtener QR en consola
docker compose -f docker-compose.dev.yml logs -f openwa
# El QR aparece en los logs como texto ASCII — escanéalo desde WhatsApp

# 4. Verificar que quedó autenticada
curl -s http://localhost:2785/api/sessions \
  -H "X-API-Key: <API_KEY>"
# status debe ser "ready"
```

> Si no puedes ver el QR ASCII en logs, usa un túnel temporal:
> `ssh -L 2785:localhost:2785 root@<IP>` y luego abre `http://localhost:2785` en tu máquina.

---

### 9.6 Registrar el Webhook apuntando a Shanti (Coolify)

Una vez Shanti esté desplegado en Coolify con su dominio:

```bash
curl -s -X POST "http://localhost:2785/api/sessions/<UUID>/webhooks" \
  -H "X-API-Key: <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://shanti.tudominio.com/api/v1/webhooks/whatsapp",
    "events": ["message.received"],
    "secret": "<WEBHOOK_SECRET>"
  }'
```

Y en Shanti (variables de entorno en Coolify):

```env
WHATSAPP_PROVIDER=openwa
WHATSAPP_PROVIDER_URL=http://localhost:2785
WHATSAPP_PROVIDER_API_KEY=<API_KEY>
WHATSAPP_OPENWA_SESSION=<UUID>
WHATSAPP_PROVIDER_WEBHOOK_SECRET=<WEBHOOK_SECRET>
```

> Si Shanti corre en Coolify con Docker en el **mismo** servidor, `http://localhost:2785`
> funciona porque el puerto está mapeado al loopback del host. Si Coolify corre en un
> servidor distinto, usa la IP privada de Hetzner entre los dos nodos.

---

### 9.7 Mantener la Sesión Activa

WhatsApp puede desconectar la sesión si detecta actividad sospechosa o el dispositivo
lleva mucho tiempo sin usarse. Opciones para recuperación automática:

```bash
# Cron job: reiniciar OpenWA a las 3am
crontab -e

# Agregar:
0 3 * * * /usr/bin/docker compose -f /opt/openwa/docker-compose.dev.yml restart openwa
```

Para alertas de desconexión, considera registrar también el evento `session.status` en
el webhook y manejar notificaciones desde Shanti.

---

## 10. Acceder al Dashboard por SSH Tunnel (recomendado)

En lugar de exponer el puerto `2785` a internet con `BIND_HOST=0.0.0.0`, accede al
dashboard de OpenWA de forma segura mediante un túnel SSH.

### 10.1 Desde tu máquina local

```bash
# Abre el túnel (tu puerto local 2785 → puerto 2785 del servidor)
ssh -L 2785:localhost:2785 root@178.105.185.165
```

Luego abre en tu navegador:

```
http://localhost:2785
```

> El túnel encripta todo el tráfico entre tu máquina y el VPS. No necesitas
> exponer puertos ni preocuparte por sniffing.

### 10.2 ¿Se cierra al salir de la sesión SSH?

**Sí.** Al ejecutar `exit` o cerrar la terminal, el túnel se cierra y
`http://localhost:2785` deja de responder.

### 10.3 Mantener el túnel abierto en segundo plano

**Opción A: background con `-N -f`**

```bash
ssh -N -f -L 2785:localhost:2785 root@178.105.185.165
```

- `-N` = no abre shell interactivo
- `-f` = se desconecta al background después de autenticar

Para cerrarlo después:

```bash
# Listar túneles activos
ps aux | grep "ssh -L 2785"

# Matar el proceso
kill <PID>
```

**Opción B: `autossh` (se reconecta automáticamente)**

```bash
# Instalar en tu máquina local
sudo apt-get install -y autossh

# Ejecutar (se reconecta si se cae)
autossh -M 0 -N -L 2785:localhost:2785 root@178.105.185.165
```

**Opción C: mantener `BIND_HOST=0.0.0.0` temporalmente**

Si necesitas acceso rápido sin túneles (por ejemplo, para escanear el QR desde tu
celular que no puede hacer SSH):

1. Cambia `BIND_HOST=0.0.0.0` en el `.env` del servidor
2. Reinicia OpenWA
3. Escanea el QR
4. Vuelve a `BIND_HOST=127.0.0.1` y reinicia

---

## 11. Referencias

- `specs/whatsapp-adapter.md` — Especificación del patron Adapter
- `docs/DEPLOYMENT.md` — Variables de entorno y despliegue
- `src/infrastructure/whatsapp/openwa/OpenWAAdapter.ts` — Implementación
