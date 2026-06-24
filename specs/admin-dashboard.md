# SDD — Admin Dashboard (PWA)
# Arrocería Shanti — Panel de Administración

**Versión:** 1.3  
**Fecha:** 2026-06-17  
**Tipo:** Progressive Web App (PWA)  
**Backend:** API existente en `src/api/routes/` — ver `specs/openapi.yaml`

---

## 1. Objetivo

Dos vistas instalables como PWA, cada una con credenciales y permisos distintos:

**Administrador** (`/admin`):
- Ver y gestionar todos los pedidos en tiempo real
- Cambiar el estado de cada pedido a lo largo de su ciclo de vida
- Ver estadísticas básicas del día
- Autenticarse con usuario y contraseña (JWT, rol `admin`)

**Repartidor** (`/delivery`):
- Ver únicamente los pedidos en estado `ready` (listos para entregar)
- Ver detalle completo del pedido: dirección, notas de entrega, cliente
- Marcar un pedido como `delivered`
- Adjuntar foto como evidencia de entrega
- Autenticarse con usuario y contraseña (JWT, rol `delivery`)

---

## 2. Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | React 18 + Vite |
| Estilos | TailwindCSS |
| Componentes | shadcn/ui |
| Iconos | Lucide React |
| Peticiones HTTP | React Query (TanStack Query v5) |
| Autenticación | JWT almacenado en `localStorage` |
| PWA | `vite-plugin-pwa` (Workbox) |
| Lenguaje | TypeScript |

**Estructura de carpetas:**
```
admin/
  src/
    pages/
      LoginPage.tsx
      OrdersPage.tsx
      StatsPage.tsx
      DriversPage.tsx
      MenuPage.tsx
    components/
      OrderCard.tsx
      OrderStatusBadge.tsx
      DriverCard.tsx
      DriverModal.tsx
      BottomNav.tsx
    hooks/
      useOrders.ts
      useStats.ts
      useDrivers.ts
      useMenu.ts
      useAuth.ts
    lib/
      api.ts          ← cliente HTTP con JWT automático
      queryClient.ts
  public/
    manifest.json
    icons/
  index.html
  vite.config.ts
```

---

## 3. Autenticación y Roles

### Roles

| Rol | Ruta de entrada | Permisos |
|-----|----------------|----------|
| `admin` | `/admin` | Todos los pedidos, todos los estados, stats |
| `delivery` | `/delivery` | Solo pedidos `ready`, solo marcar `delivered` + foto (opcional) |

El JWT incluye el campo `role` en el payload. El frontend redirige según el rol al hacer login.

### Flujo de Login (compartido)

```
Usuario abre la app
  ↓
¿Tiene token válido en localStorage?
  ├─ Sí, rol admin    → redirigir a /admin/orders
  ├─ Sí, rol delivery → redirigir a /delivery
  └─ No → mostrar LoginPage

LoginPage:
  - Campo usuario
  - Campo contraseña
  - Botón "Entrar"
  ↓
POST /api/v1/auth/login
  ├─ 200 { token, role: 'admin' }    → /admin/orders
  ├─ 200 { token, role: 'delivery' } → /delivery
  └─ 401 → mostrar "Credenciales incorrectas"
```

### Comportamiento del token

- Se incluye automáticamente en cada request: `Authorization: Bearer <token>`
- Expira en 8 horas
- Si un request devuelve `401`, limpiar token y redirigir a LoginPage
- No hay refresh token en v1

---

## 4. Pantallas

### 4.1 Login (`/login`)

```
┌─────────────────────────────┐
│                             │
│    🍚 Arrocería Shanti      │
│       Panel Admin           │
│                             │
│  ┌─────────────────────┐    │
│  │ Usuario             │    │
│  └─────────────────────┘    │
│  ┌─────────────────────┐    │
│  │ Contraseña          │    │
│  └─────────────────────┘    │
│                             │
│  ┌─────────────────────┐    │
│  │      Entrar         │    │
│  └─────────────────────┘    │
│                             │
└─────────────────────────────┘
```

**Comportamiento:**
- Deshabilitar botón mientras se hace la petición
- Mostrar spinner en el botón durante carga
- Mostrar error inline si las credenciales son incorrectas

---

### 4.2 Pedidos (`/orders`) — Pantalla principal

```
┌─────────────────────────────┐
│ Pedidos  [🔄]  [hoy: 12]   │  ← header con refresh manual
├─────────────────────────────┤
│ [Todos] [⏳] [✅] [🍳] [🎉] │  ← filtros de estado
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ #SH-042  •  🛵 Domicilio│ │
│ │ Carlos — 3001234567     │ │
│ │ • 2x Arroz Chino Pollo  │ │
│ │ • 1x Coca-Cola 400ml    │ │
│ │ Total: $39.000          │ │
│ │ ⏳ Pendiente  •  14:32  │ │
│ │ [Confirmar]             │ │  ← acción principal según estado
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ #SH-041  •  📦 Recoger  │ │
│ │ María — 3109876543      │ │
│ │ • 1x Bandeja Paisa      │ │
│ │ Total: $22.000          │ │
│ │ 🍳 Preparando  •  14:18 │ │
│ │ [Listo]                 │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│  📋 Pedidos  │  📊 Stats   │  ← bottom nav
└─────────────────────────────┘
```

**Comportamiento:**
- Actualizaciones en tiempo real vía **SSE** (`EventSource` a `GET /api/v1/events`)
- Eventos `orderCreated`, `orderUpdated`, `orderDeleted` invalidan la caché de React Query automáticamente
- Filtros de estado: Todos / ⏳ Pendiente / ✅ Confirmado / 🍳 Preparando / 🎉 Listo
- Ordenados por `created_at` descendente (más reciente arriba)
- Botón de acción principal cambia según el estado actual del pedido (ver sección 5)
- Pull-to-refresh en móvil
- Badge con conteo de pedidos pendientes en el título
- Notificación sonora + vibración al recibir pedido nuevo (`orderCreated`)

---

### 4.3 Detalle de Pedido (modal o bottom sheet)

Al tocar un `OrderCard` se abre un panel con:

```
┌─────────────────────────────┐
│ ← Pedido #SH-042            │
├─────────────────────────────┤
│ 👤 Carlos García            │
│ 📞 3001234567               │
│ 🛵 Domicilio                │
│ 📍 Carrera 45 #12-34,       │
│    Barrio Centro            │
│ 📝 Tocar timbre dos veces   │  ← delivery_notes si existe
├─────────────────────────────┤
│ Productos:                  │
│ • 2x Arroz Chino de Pollo   │
│   (sin cebolla)             │
│ • 1x Coca-Cola 400ml        │
├─────────────────────────────┤
│ Subtotal:     $36.000       │
│ Domicilio:    $3.000        │
│ Total:        $39.000       │
│ Pago:         💵 Efectivo   │
├─────────────────────────────┤
│ Estado: ⏳ Pendiente        │
│ Creado: 14:32               │
├─────────────────────────────┤
│ [  Cancelar pedido  ]       │
│ [    Confirmar ✅   ]       │  ← acción principal
└─────────────────────────────┘
```

---

### 4.4 Estadísticas (`/stats`)

```
┌─────────────────────────────┐
│ Estadísticas — Hoy          │
├─────────────────────────────┤
│  💰 Ventas totales          │
│     $342.000                │
│                             │
│  📦 Pedidos completados     │
│     14                      │
│                             │
│  ⏳ Pedidos pendientes      │
│     3                       │
│                             │
│  🛵 Domicilios  │  📦 Local │
│     9           │     5     │
│                             │
│  💵 Efectivo   │  📱 Nequi  │
│     $210.000   │  $132.000  │
├─────────────────────────────┤
│  📋 Pedidos │ 📊 Stats │ 🛵 Equipo │
└─────────────────────────────┘
```

**Datos desde:** `GET /api/v1/orders/stats/dashboard`  
**Refresco:** cada 60 segundos o al entrar a la pantalla

---

### 4.5 Gestión de Repartidores (`/admin/drivers`)

```
┌─────────────────────────────┐
│ 🛵 Repartidores      [+ Add] │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ 👤 Juan Pérez           │ │
│ │ @juan.perez             │ │
│ │ 🟢 Activo               │ │
│ │ [Editar] [Desactivar]   │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ 👤 Andrés López         │ │
│ │ @andres.lopez           │ │
│ │ 🔴 Inactivo             │ │
│ │ [Editar] [Activar]      │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│  📋 Pedidos │ 📊 Stats │ 🛵 Equipo │
└─────────────────────────────┘
```

#### Modal: Crear / Editar Repartidor

```
┌─────────────────────────────┐
│ Nuevo repartidor        [✕] │
├─────────────────────────────┤
│ Nombre completo             │
│ ┌─────────────────────────┐ │
│ │ Juan Pérez              │ │
│ └─────────────────────────┘ │
│                             │
│ Usuario (para login)        │
│ ┌─────────────────────────┐ │
│ │ juan.perez              │ │
│ └─────────────────────────┘ │
│                             │
│ Contraseña                  │
│ ┌─────────────────────────┐ │
│ │ ••••••••                │ │
│ └─────────────────────────┘ │
│                             │
│ [Cancelar]  [Guardar]       │
└─────────────────────────────┘
```

**Comportamiento:**
- El admin ve la lista de todos los repartidores con su estado (activo / inactivo)
- Botón `[+ Add]` abre el modal de creación
- Repartidor inactivo no puede iniciar sesión en `/delivery`
- Al editar, la contraseña es opcional — dejar vacío para no cambiarla
- Confirmar antes de desactivar: *"¿Desactivar a Juan Pérez? No podrá acceder hasta que lo reactives."*
- No se pueden eliminar repartidores, solo desactivar (preserva historial de entregas)

---

## 4.6 Gestión de Menú / Productos (`/admin/menu`)

Pantalla para que el administrador gestione el catálogo de productos: editar precios, cambiar disponibilidad, modificar opciones de personalización.

```
┌─────────────────────────────┐
│ 🍚 Menú              [+ Add]│
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ Arroz Chino de Pollo    │ │
│ │ $18.000  🟢 Disponible  │ │
│ │ [Editar] [Desactivar]   │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ Bandeja Paisa           │ │
│ │ $22.000  🔴 Agotado     │ │
│ │ [Editar] [Activar]      │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│  📋 Pedidos │ 📊 Stats │ 🛵 Equipo │ 🍚 Menú │
└─────────────────────────────┘
```

#### Modal: Crear / Editar Producto

```
┌─────────────────────────────┐
│ Editar producto         [✕] │
├─────────────────────────────┤
│ Nombre                      │
│ ┌─────────────────────────┐ │
│ │ Arroz Chino de Pollo    │ │
│ └─────────────────────────┘ │
│                             │
│ Categoría                   │
│ ┌─────────────────────────┐ │
│ │ Arroz Chino ▼           │ │
│ └─────────────────────────┘ │
│                             │
│ Precio                      │
│ ┌─────────────────────────┐ │
│ │ 18000                   │ │
│ └─────────────────────────┘ │
│                             │
│ Tiempo preparación (min)    │
│ ┌─────────────────────────┐ │
│ │ 20                      │ │
│ └─────────────────────────┘ │
│                             │
│ Personalizaciones             │
│ ┌─────────────────────────┐ │
│ │ sin cebolla, sin ají    │ │
│ └─────────────────────────┘ │
│                             │
│ [Cancelar]  [Guardar]       │
└─────────────────────────────┘
```

**Comportamiento:**
- El admin ve la lista de todos los productos agrupados por categoría
- Puede expandir/colapsar cada categoría
- Botón `[+ Add]` abre el modal de creación de producto
- Botón `[+ Categoría]` permite crear una nueva categoría (ej: "Entradas", "Postres")
- Las categorías se ordenan por `sort_order` (arrastrar para reordenar en v1.6)
- Producto "desactivado" (`available: false`) no aparece en el menú del bot de WhatsApp
- Al editar precio, los pedidos futuros usan el nuevo precio; los pasados conservan el histórico
- Confirmar antes de eliminar producto: *"¿Eliminar Arroz Chino de Pollo? Ya no estará disponible en el menú."*
- No se pueden eliminar categorías que tengan productos asociados

**Datos desde:** `GET /api/v1/products` (público, solo disponibles) / `GET /api/v1/products?admin=true` (auth, incluye agotados) / `GET /api/v1/categories`

---

## 5. Ciclo de Vida de un Pedido

### Panel Admin

El botón de acción principal en cada tarjeta sigue este flujo:

```
⏳ pending    → [Confirmar]   → PATCH status: confirmed
✅ confirmed  → [Preparando]  → PATCH status: preparing
🍳 preparing  → [Listo]       → PATCH status: ready
🎉 ready      → [Entregado]   → PATCH status: delivered  (si pickup)
```

**Pedidos de domicilio en `ready`:** el admin los ve como listos — la acción de marcar `delivered` la hace el repartidor desde su vista.

**Cancelar:** disponible desde el detalle en cualquier estado antes de `delivered`.  
Pide confirmación con un diálogo: *"¿Cancelar pedido #SH-042? Esta acción no se puede deshacer."*

### Vista Repartidor

```
🎉 ready → [Ver detalle + ruta] → [Marcar entregado 📷] → PATCH status: delivered
```

Solo los pedidos de tipo `delivery` en estado `ready` aparecen en la vista del repartidor.

---

## 5.1 Pantalla Repartidor (`/delivery`)

```
┌─────────────────────────────┐
│ 🛵 Mis entregas — Hoy  [🔄] │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ #SH-042  •  🎉 Listo   │ │
│ │ 📍 Carrera 45 #12-34    │ │
│ │    Barrio Centro        │ │
│ │ 📝 Tocar timbre 2 veces │ │  ← delivery_notes
│ │ 👤 Carlos — 3001234567  │ │
│ │ 💰 $39.000 efectivo     │ │
│ │ [📷 Marcar entregado]   │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ #SH-040  •  🎉 Listo   │ │
│ │ 📍 Manzana 5 Casa 12    │ │
│ │    Urb. Los Almendros   │ │
│ │ 👤 María — 3109876543   │ │
│ │ 💰 $22.000 efectivo     │ │
│ │ [📷 Marcar entregado]   │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

### Flujo de entrega con foto

```
Repartidor toca [📷 Marcar entregado]
  ↓
Abre cámara del dispositivo (input type="file" accept="image/*" capture="environment")
  ↓
Repartidor toma la foto
  ↓
Preview de la foto + botón [Confirmar entrega]
  ↓
POST /api/v1/orders/:id/delivery-proof  ← sube la imagen
PATCH /api/v1/orders/:id { status: 'delivered' }
  ↓
Tarjeta desaparece de la lista
Toast: "✅ Entrega confirmada #SH-042"
```

**Comportamiento de la foto:**
- Se sube al servidor o a un bucket (S3 / Cloudinary — a definir en v1.4)
- En v1.0 se puede omitir el upload y solo hacer el PATCH como primer paso
- La URL de la foto queda guardada en `orders.delivery_proof_url` (campo nuevo en DB)

**SSE:** conexión `EventSource` a `/api/v1/events` para recibir actualizaciones en tiempo real de pedidos listos asignados a reparto.

---

## 6. Comportamiento PWA

### Instalación

En Android (Chrome):
1. Admin abre `https://tudominio.com/admin` en Chrome
2. Chrome muestra banner "Agregar a pantalla de inicio"
3. Se instala como app con ícono propio

### Offline

- Si no hay internet, mostrar banner "Sin conexión — los datos pueden estar desactualizados"
- La app sigue abriendo con los últimos datos cacheados (Workbox cache-first para assets)
- Las acciones de cambio de estado fallidas muestran toast de error

### Manifest (`public/manifest.json`)

```json
{
  "name": "Shanti Admin",
  "short_name": "Shanti",
  "description": "Panel de pedidos — Arrocería Shanti",
  "start_url": "/admin",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#f97316",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

## 7. Integración con el Backend existente

| Acción | Rol | Endpoint | Auth |
|--------|-----|----------|------|
| Login | ambos | `POST /api/v1/auth/login` | ❌ |
| Feature flags públicas | público | `GET /api/v1/config/public` | ❌ |
| Ver todos los pedidos | admin | `GET /api/v1/orders?status=...` | ✅ JWT |
| Ver pedidos `ready` (domicilio) | delivery | `GET /api/v1/orders` — solo los asignados a él (`assignedDriver = userId`) | ✅ JWT |
| Ver detalle | ambos | `GET /api/v1/orders/:id` | ✅ JWT |
| Cambiar estado | admin | `PATCH /api/v1/orders/:id` | ✅ JWT |
| Marcar entregado | delivery | `PATCH /api/v1/orders/:id { status: delivered }` | ✅ JWT |
| Asignar repartidor | admin | `PATCH /api/v1/orders/:id/assign { driverId }` | ✅ JWT |
| Subir foto evidencia | delivery | `POST /api/v1/orders/:id/delivery-proof` | ✅ JWT |
| Estadísticas generales | admin | `GET /api/v1/orders/stats/dashboard` | ✅ JWT |
| Stats por repartidor | admin | `GET /api/v1/users/:id/stats` | ✅ JWT |
| Listar repartidores | admin | `GET /api/v1/users?role=delivery` | ✅ JWT |
| Crear repartidor | admin | `POST /api/v1/users` | ✅ JWT |
| Editar repartidor | admin | `PATCH /api/v1/users/:id` | ✅ JWT |
| Activar / Desactivar | admin | `PATCH /api/v1/users/:id { active: bool }` | ✅ JWT |
| Listar productos | público | `GET /api/v1/products` | ❌ |
| Listar productos (admin) | admin | `GET /api/v1/products?admin=true` | ✅ JWT |
| Crear producto | admin | `POST /api/v1/products` | ✅ JWT |
| Editar producto | admin | `PATCH /api/v1/products/:id` | ✅ JWT |
| Eliminar producto | admin | `DELETE /api/v1/products/:id` | ✅ JWT |
| Listar categorías | público | `GET /api/v1/categories` | ❌ |
| Crear categoría | admin | `POST /api/v1/categories` | ✅ JWT |
| Editar categoría | admin | `PATCH /api/v1/categories/:id` | ✅ JWT |
| Eliminar categoría | admin | `DELETE /api/v1/categories/:id` | ✅ JWT |

**Implementado (v1.3):
- ✅ `POST /api/v1/auth/login` con campo `role` en el JWT payload
- ✅ Middleware JWT `requireJWT` con validación de rol en rutas de órdenes
- ✅ Tabla `users` (unifica admin + repartidores, campo `role`)
- ✅ Columna `delivered_by` (FK a `users`) en tabla `orders`
- ✅ Endpoint `GET /api/v1/users/:id/stats` para stats de repartidor
- ✅ Contraseñas hasheadas con `bcrypt`
- ✅ Notificaciones WhatsApp al cliente por cambio de estado

**Pendiente en backend (a implementar en v1.4):**
- `POST /api/v1/orders/:id/delivery-proof` — endpoint nuevo para subir foto
- Campo `delivery_proof_url` en tabla `orders` (migración DB)
- Definir storage para fotos: S3, Cloudinary o almacenamiento local

---

## 8. Variables de Entorno (frontend)

```
VITE_API_URL=https://tudominio.com/api/v1
```

### Credenciales de demo en pantalla de login

Las credenciales de demo se muestran **solo en desarrollo** usando la variable `import.meta.env.DEV` que Vite gestiona automáticamente:

```typescript
// admin/src/components/LoginScreen.tsx
{import.meta.env.DEV && (
  <div className="mt-4 text-xs text-slate-400 text-center">
    <p>Admin: admin / admin123</p>
    <p>Repartidor: carlos_r / driver123</p>
  </div>
)}
```

| Entorno | `import.meta.env.DEV` | Credenciales visibles |
|---------|----------------------|----------------------|
| `npm run dev` | `true` | ✅ Sí |
| `npm run build` (producción) | `false` | ❌ No |

No requiere ninguna variable de entorno adicional — Vite lo maneja automáticamente.

---

## 9. Base de Datos — Nuevas Entidades

### Tabla `users` (nueva)

Unifica autenticación de **administradores y repartidores** en una sola tabla. No hay tabla `drivers` separada — el campo `role` diferencia los tipos de usuario.

| Columna | Tipo | Notas |
|---------|------|-------|
| id | SERIAL PK | autoincrement |
| name | VARCHAR(100) | Nombre completo |
| username | VARCHAR(50) UNIQUE | Para login |
| password_hash | VARCHAR(255) | bcrypt, nunca texto plano |
| role | VARCHAR(20) | `admin` \| `delivery` |
| active | BOOLEAN | DEFAULT true — inactivo no puede hacer login |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**Nota:** El usuario `admin` inicial se crea via script de seed o variables de entorno al arrancar el servidor por primera vez.

### Tabla `categories` (nueva — NO EXISTE todavía)

Permite al admin crear, editar y eliminar categorías del menú dinámicamente. Reemplaza las categorías hardcodeadas (`arroz_chino`, `bandeja_paisa`, `bebidas`).

| Columna | Tipo | Notas |
|---------|------|-------|
| id | VARCHAR(50) PK | slug único, ej: `arroz_chino` |
| name | VARCHAR(100) | Nombre visible, ej: `Arroces Chinos` |
| sort_order | INTEGER | DEFAULT 0 — orden de visualización en el menú |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**Categorías iniciales (seed):**
```sql
INSERT INTO categories (id, name, sort_order) VALUES
  ('arroz_chino', 'Arroces Chinos', 1),
  ('bandeja_paisa', 'Bandejas', 2),
  ('bebidas', 'Bebidas', 3);
```

### Tabla `products` (nueva — NO EXISTE todavía)

**Estado actual:** Los productos están hardcodeados en `src/domain/models/Product.ts`. La tabla `products` debe crearse como parte de la implementación de v1.5.

Reemplazará el catálogo hardcodeado en memoria por una tabla persistente. Permite al admin editar precios, disponibilidad y personalizaciones sin tocar código.

**Contexto:** Actualmente `order_items` guarda `product_id` (string) sin FK a ninguna tabla. Al crear `products`, `product_id` en `order_items` podría convertirse en FK.

| Columna | Tipo | Notas |
|---------|------|-------|
| id | VARCHAR(50) PK | slug único, ej: `arroz-pollo` |
| name | VARCHAR(100) | Nombre visible en el menú |
| category_id | VARCHAR(50) FK | referencia a `categories(id)` |
| price | INTEGER | Precio en pesos colombianos (sin decimales) |
| description | TEXT | nullable — descripción corta |
| available | BOOLEAN | DEFAULT true — false = no aparece en el menú |
| preparation_minutes | INTEGER | DEFAULT 25 — tiempo estimado de preparación |
| customization_options | TEXT[] | Array de strings, ej: `['sin cebolla', 'sin ají']` |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |

**Migración desde catálogo hardcodeado (`src/domain/models/Product.ts`):**
```sql
-- Seed: insertar productos actuales del catálogo hardcodeado
INSERT INTO products (id, name, category, price, description, available, preparation_minutes, customization_options)
VALUES
  -- Arroces Chinos
  ('arroz-pollo', 'Arroz Chino de Pollo', 'arroz_chino', 18000, 'Arroz salteado con pollo, verduras y salsa de soya', true, 20, ARRAY['sin cebolla', 'sin ají', 'extra pollo']),
  ('arroz-cerdo', 'Arroz Chino de Cerdo', 'arroz_chino', 20000, 'Arroz salteado con cerdo, verduras y salsa de soya', true, 20, ARRAY['sin cebolla', 'sin ají']),
  ('arroz-camaron', 'Arroz Chino de Camarón', 'arroz_chino', 24000, 'Arroz salteado con camarón, verduras y salsa de soya', true, 25, ARRAY['sin cebolla', 'sin ají']),
  ('arroz-especial', 'Arroz Chino Especial', 'arroz_chino', 28000, 'Arroz salteado con pollo, cerdo, camarón y verduras', true, 25, ARRAY['sin cebolla', 'sin ají', 'extra pollo', 'extra camarón']),
  -- Bandejas
  ('bandeja-paisa', 'Bandeja Paisa', 'bandeja_paisa', 22000, 'Arroz, frijoles, carne molida, chorizo, huevo, arepa y aguacate', true, 25, ARRAY['sin huevo', 'sin chorizo']),
  ('bandeja-pollo', 'Bandeja de Pollo', 'bandeja_paisa', 20000, 'Arroz, frijoles, pechuga de pollo, ensalada y arepa', true, 22, ARRAY['sin piel', 'pechuga desmechada']),
  -- Bebidas
  ('coca-400', 'Coca-Cola 400ml', 'bebidas', 4000, 'Gaseosa Coca-Cola personal', true, 0, ARRAY[]::text[]),
  ('coca-1-5', 'Coca-Cola 1.5L', 'bebidas', 8000, 'Gaseosa Coca-Cola familiar', true, 0, ARRAY[]::text[]),
  ('jugo-natural', 'Jugo Natural', 'bebidas', 6000, 'Jugo de fruta natural del día', true, 5, ARRAY['sin azúcar', 'con leche']);
```

### Cambios en tabla `orders` (ALTER TABLE)

| Columna | Tipo | Notas |
|---------|------|-------|
| delivery_proof_url | TEXT | nullable — URL de foto de evidencia de entrega |
| delivered_by | INTEGER FK | nullable — referencia a `users(id)`, registra qué repartidor entrego el pedido |
| assigned_driver | INTEGER FK | nullable — referencia a `users(id)`, repartidor asignado al pedido (P7) |

Esta FK permite consultas de stats por repartidor:
```sql
SELECT u.name, COUNT(o.id) as pedidos_entregados, SUM(o.total) as monto_total
FROM orders o
JOIN users u ON o.delivered_by = u.id
WHERE u.role = 'delivery'
  AND o.status = 'delivered'
  AND o.created_at >= NOW() - INTERVAL '30 days'
GROUP BY u.id, u.name;
```

### Ruta de migración a v2.0 (Opción B)

Si en v2.0 se necesitan datos adicionales por repartidor (vehículo, zona, calificación), se crea una tabla `drivers` como **extensión** de `users` sin romper nada existente:

```sql
CREATE TABLE drivers (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id),  -- login sigue siendo por users
  vehicle_type  VARCHAR(50),
  coverage_zone VARCHAR(100),
  rating        DECIMAL(3,2),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Poblar desde datos existentes
INSERT INTO drivers (user_id)
SELECT id FROM users WHERE role = 'delivery';
```

**Lo que NO cambia en la migración:**
- `orders.delivered_by` sigue apuntando a `users(id)`
- Los endpoints de auth y JWT no cambian
- La tabla `users` sigue siendo la fuente de autenticación

**Lo que se añade:**
- Nuevos endpoints `GET/PATCH /api/v1/drivers/:id` para datos de vehículo, zona y calificación
- El panel admin mostraría esos campos en el perfil del repartidor

---

## 10. Comunicación Asíncrona

### Notificaciones WhatsApp al Cliente (v1.3)

Cada vez que el admin cambia el estado de un pedido, el cliente recibe una notificación por WhatsApp:

| Estado | Mensaje al cliente |
|--------|-------------------|
| `confirmed` | ✅ Tu pedido ha sido confirmado. Está en preparación. |
| `preparing` | 🍳 Tu pedido está en preparación. Tiempo estimado: ~25 min. |
| `ready` (delivery) | 🎉 Pedido listo. Un repartidor está en camino. |
| `ready` (pickup) | 🎉 Pedido listo. Puedes pasar a recogerlo. |
| `delivered` | ✅ Pedido entregado. Gracias por tu compra. |
| `cancelled` | ❌ Pedido cancelado. |

**Implementación:** El endpoint `PATCH /api/v1/orders/:id` llama a `notifyCustomer()` después de guardar el cambio en DB. Usa `sendWhatsAppMessage` (WhatsApp Cloud API). Si falla el envío, el cambio de estado no se afecta (fire-and-forget).

### Actualización en tiempo real con SSE (v1.5)

**Reemplaza polling por SSE.** El frontend abre una conexión `EventSource` a `GET /api/v1/events` y recibe eventos push del servidor. Cada evento (`orderCreated`, `orderUpdated`, `orderDeleted`) invalida la caché de React Query, que se re-hidrata automáticamente con el endpoint REST correspondiente.

| Evento | Origen | Acción en frontend |
|----------|--------|-------------------|
| `orderCreated` | `POST /api/v1/orders` o bot WhatsApp | Invalida caché de pedidos, suena notificación si hay pedido pendiente nuevo |
| `orderUpdated` | `PATCH /api/v1/orders/:id` | Invalida caché de pedidos |
| `orderDeleted` | `DELETE /api/v1/orders/:id` | Invalida caché de pedidos |

```typescript
// hooks/useOrders.ts — conexión SSE
useEffect(() => {
  const es = new EventSource('/api/v1/events');

  es.addEventListener('orderCreated', () => {
    qc.invalidateQueries({ queryKey: ['orders'] });
  });
  es.addEventListener('orderUpdated', () => {
    qc.invalidateQueries({ queryKey: ['orders'] });
  });
  es.addEventListener('orderDeleted', () => {
    qc.invalidateQueries({ queryKey: ['orders'] });
  });

  return () => es.close();
}, [qc]);
```

React Query mantiene: deduplicación, caché, refetch en foco de ventana y reconexión.

### Notificación de pedido nuevo (sonido + vibrar)

La detección compara el resultado anterior con el nuevo cuando React Query re-hidrata tras un evento SSE:

```typescript
// hooks/useOrders.ts
const prevCountRef = useRef(0);

useEffect(() => {
  const newCount = orders.filter(o => o.status === 'pending').length;
  if (newCount > prevCountRef.current) {
    // Reproducir sonido
    new Audio('/sounds/new-order.mp3').play();
    // Vibrar (móvil)
    navigator.vibrate?.([200, 100, 200]);
    // Badge en título del documento
    document.title = `(⚠️${newCount}) Pedidos — Shanti`;
  }
  prevCountRef.current = newCount;
}, [orders]);
```

**Comportamiento:**
- Sonido solo cuando **aumenta** el número de pedidos pendientes
- El archivo `new-order.mp3` vive en `admin/public/sounds/`
- El título del documento muestra el badge mientras haya pendientes
- Al confirmar el último pedido pendiente, el título vuelve a normal

### WebSocket + Push Notifications — planificado para v2.0

Cuando se necesite notificar con la app cerrada o cerrada en segundo plano:
- Push Notifications vía Service Worker
- WebSocket con `socket.io` para más de 5 admins simultáneos

---

## 11. Estructura del Monorepo

El frontend admin vive dentro del mismo repositorio que el backend.

```
shanti-food/                     ← repo raíz
  src/                           ← backend Express (existente)
    api/routes/
      orders.ts
      products.ts
      webhook.ts
      auth.ts                    ← nuevo (login + JWT)
      users.ts                   ← nuevo (CRUD admin + repartidores)
    bot/
    domain/
    infrastructure/
  tests/                         ← tests backend (existente)
  admin/                         ← PWA admin (nuevo)
    src/
      pages/
      components/
      hooks/
      lib/
    public/
      manifest.json
      icons/
    package.json
    vite.config.ts
    tsconfig.json
  package.json                   ← backend
  docker-compose.yml
  .env
```

### Despliegue en Coolify (Hetzner)

Un solo servicio — Express sirve el frontend estático compilado:

```typescript
// src/index.ts
app.use('/admin', express.static(path.join(__dirname, '../admin/dist')));
```

**Build script (`package.json` raíz):**
```json
{
  "scripts": {
    "build": "npm run build:admin && tsc",
    "build:admin": "cd admin && npm install && npm run build",
    "start": "node dist/index.js"
  }
}
```

**Coolify config:**
- Build command: `npm run build`
- Start command: `npm start`
- Puerto: `3000`
- Variables de entorno: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_USER`, `ADMIN_PASSWORD`, `WHATSAPP_*`

---

## 12. Estados Vacíos y de Error

### Estados vacíos

| Pantalla | Condición | Mensaje |
|----------|-----------|--------|
| Lista pedidos (admin) | Sin pedidos activos | "🍚 Sin pedidos por ahora. Se actualiza cada 5 segundos." |
| Lista entregas (repartidor) | Sin pedidos `ready` | "📦 No hay pedidos listos para entregar en este momento." |
| Lista repartidores | Sin repartidores creados | "Aún no hay repartidores. Toca [+ Add] para crear el primero." |
| Estadísticas | Sin datos del día | "Sin pedidos hoy todavía. 🌍" |

### Estados de error

| Situación | Comportamiento |
|-----------|---------------|
| Sin conexión a internet | Banner amarillo: "Sin conexión — última actualización: 14:32" |
| Error al cambiar estado de pedido | Toast rojo: "No se pudo actualizar el pedido. Intenta de nuevo." Revertió el botón. |
| Error al subir foto | Toast rojo: "No se pudo subir la foto. Puedes intentarlo de nuevo o marcar sin foto." |
| Token expirado (401) | Limpia localStorage y redirige a `/login` automáticamente |
| Error al crear repartidor (409) | Inline bajo el campo usuario: "Este nombre de usuario ya existe." |
| Error al crear producto (409) | Inline: "Ya existe un producto con este ID." |
| Error al editar producto | Toast rojo: "No se pudo guardar el producto. Intenta de nuevo." |
| Error genérico del servidor (500) | Toast rojo: "Error del servidor. Intenta más tarde." |

---

## 13. Wireframe: Stats por Repartidor

Accesible desde la pantalla de repartidores, al tocar el nombre de uno:

```
┌─────────────────────────────┐
│ ← Juan Pérez              │
├─────────────────────────────┤
│ 📦 Total entregados         │
│    147 pedidos            │
│                             │
│ 📅 Últimos 30 días          │
│    38 pedidos             │
│                             │
│ 💰 Monto total gestionado  │
│    $2.840.000             │
├─────────────────────────────┤
│ Últimas entregas:          │
│ • #SH-142 — $39.000 — hoy  │
│ • #SH-138 — $22.000 — ayer │
│ • #SH-131 — $45.000 — ayer │
├─────────────────────────────┤
│  📋 Pedidos │ 📊 Stats │ 🛵 Equipo │
└─────────────────────────────┘
```

**Datos desde:** `GET /api/v1/users/:id/stats`

---

## 14. Flujo de Seed — Admin Inicial

El primer usuario `admin` no puede crearse desde la app (no hay nadie autenticado todavía). Se crea automáticamente al inicializar la DB:

```typescript
// src/infrastructure/database/connection.ts — al final de initDatabase()
async function seedAdminUser(): Promise<void> {
  const existing = await query('SELECT id FROM users WHERE role = $1 LIMIT 1', ['admin']);
  if (existing.rows.length > 0) return; // ya existe, no hacer nada

  const username = process.env.ADMIN_USER ?? 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('ADMIN_PASSWORD es requerido para el seed inicial');

  const hash = await bcrypt.hash(password, 12);
  await query(
    'INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, $4)',
    ['Administrador', username, hash, 'admin']
  );
  console.log('[seed] Usuario admin creado.');
}
```

**Variables de entorno requeridas solo para el seed:**
```
ADMIN_USER=admin          ← opcional, default: 'admin'
ADMIN_PASSWORD=<segura>   ← requerido en el primer arranque
```

Despues del seed, `ADMIN_PASSWORD` puede removerse del `.env` — la contraseña queda en la DB hasheada. Para cambiarla, usar el panel de administración o un script.

---

## 15. Modelo Base — Figma Make

**Referencia:** https://www.figma.com/make/iVvFTmg56nLatFrHCwDX9D/Minimalist-PWA-Admin-Dashboard

El prototipo generado en Figma Make es la **base visual y estructural** del frontend. La implementación real debe partir de su código y conectarle la lógica real (React Query + API).

### Stack del modelo (idéntico al SDD)

- React 18 + TypeScript
- Vite
- TailwindCSS
- shadcn/ui
- Componentes propios sin librería de state management (estado local en `App.tsx`)

### Mapa de componentes: Figma Make → Implementación real

| Archivo Figma Make | Archivo en `admin/src/` | Cambios requeridos |
|--------------------|------------------------|--------------------|
| `App.tsx` | `App.tsx` | Reemplazar estado local + mock data por React Query + API real |
| `components/types.tsx` | `lib/types.ts` | Alinear tipos con esquema DB real (`id: number` no `string`, añadir `deliveredBy`, `deliveryProofUrl`) |
| `components/LoginScreen.tsx` | `pages/LoginPage.tsx` | Conectar a `POST /api/v1/auth/login`, guardar token en `localStorage`, añadir guard `import.meta.env.DEV` para credenciales demo |
| `components/OrdersListScreen.tsx` | `pages/OrdersPage.tsx` | Usar `useQuery` con `refetchInterval: 5000`, añadir lógica de sonido al detectar pedido nuevo |
| `components/OrderDetailModal.tsx` | `components/OrderDetailModal.tsx` | Conectar botones a `PATCH /api/v1/orders/:id`, añadir UI de asignación de repartidor (`PATCH /api/v1/orders/:id/assign`) |
| `components/StatsScreen.tsx` | `pages/StatsPage.tsx` | Conectar a `GET /api/v1/orders/stats/dashboard` con `refetchInterval: 60000` |
| `components/DriversScreen.tsx` | `pages/DriversPage.tsx` | Conectar a `GET/POST /api/v1/users?role=delivery` |
| `components/DriverFormModal.tsx` | `components/DriverFormModal.tsx` | Conectar a `POST /api/v1/users` y `PATCH /api/v1/users/:id` |
| `components/DriverStatsScreen.tsx` | `pages/DriverStatsPage.tsx` | Conectar a `GET /api/v1/users/:id/stats` |
| `components/MenuScreen.tsx` | `pages/MenuPage.tsx` | Conectar a `GET/POST/PATCH /api/v1/products` |
| `components/ProductFormModal.tsx` | `components/ProductFormModal.tsx` | Conectar a `POST /api/v1/products` y `PATCH /api/v1/products/:id` |
| `components/DeliveryScreen.tsx` | `pages/DeliveryPage.tsx` | Usar `useQuery` con `refetchInterval: 5000`, conectar "Marcar entregado" a `PATCH /api/v1/orders/:id`. Cuando `DELIVERY_DASHBOARD_ENABLED=false`, mostrar pantalla "Dashboard deshabilitado" en lugar de la lista de pedidos |
| `components/BottomNav.tsx` | `components/BottomNav.tsx` | Sin cambios — reutilizar directo |
| `components/Toast.tsx` | `components/Toast.tsx` | Sin cambios — reutilizar directo |
| `components/OfflineBanner.tsx` | `components/OfflineBanner.tsx` | Conectar a evento real `window.addEventListener('offline/online')` |
| `components/SkeletonLoader.tsx` | `components/SkeletonLoader.tsx` | Sin cambios — reutilizar directo |

### Tipos a ajustar (`types.tsx` → `lib/types.ts`)

El modelo usa tipos simplificados con datos mock. En la implementación real:

```typescript
// Cambios respecto al modelo Figma Make
export interface Order {
  id: string;          // mantener string (formato SH-042)
  // ... mismos campos ...
  deliveredBy?: number;       // nuevo — FK a users.id
  deliveryProofUrl?: string;  // nuevo — URL foto evidencia
}

export interface User {
  id: number;          // en el modelo es string, en DB es integer
  username: string;
  role: 'admin' | 'delivery';  // 'delivery' en DB, 'driver' en el modelo — unificar a 'delivery'
  name: string;
  active: boolean;
}
```

> **Nota:** El modelo Figma Make usa `role: 'driver'` internamente. La implementación real usa `role: 'delivery'` para alinearse con el backend y la DB. Ajustar el tipo y todos los guards al importar el código.

### Lógica mock → lógica real (patrón de migración)

```typescript
// MODELO FIGMA MAKE (mock)
const [orders, setOrders] = useState<Order[]>(MOCK_ORDERS);

// IMPLEMENTACIÓN REAL (React Query)
const { data: orders = [], isLoading } = useQuery({
  queryKey: ['orders'],
  queryFn: () => api.get('/orders').then(r => r.data),
  refetchInterval: 5000,
});
```

### Credenciales demo (ya documentado en §8)

```typescript
// LoginScreen.tsx — visible solo en desarrollo
{import.meta.env.DEV && (
  <div className="mt-4 text-xs text-slate-400 text-center">
    <p>Admin: admin / admin123</p>
    <p>Repartidor: carlos_r / driver123</p>
  </div>
)}
```

---

## 16. Lo que NO incluye v1.4

- Notificaciones push nativas (WebSocket — v2.0)
- Historial de pedidos con filtros de fecha
- Modo oscuro
- Asignación manual de pedidos a repartidor específico
- Storage de fotos en la nube (v1.4 omite upload, solo PATCH status)

## 17. Planificado para v1.5 — Gestión de Menú

- Tabla `categories` en DB (categorías dinámicas, reemplaza hardcodeadas)
- Tabla `products` en DB (reemplaza catálogo hardcodeado en memoria)
- Endpoints CRUD productos: `GET/POST/PATCH/DELETE /api/v1/products`
- Endpoints CRUD categorías: `GET/POST/PATCH/DELETE /api/v1/categories`
- Pantalla `MenuPage` en admin panel con gestión de categorías
- Productos desactivados no aparecen en el menú del bot de WhatsApp
- Precios editables en tiempo real (pedidos futuros usan nuevo precio)

## 18. Planificado para v1.6 — Reporte de Ingresos (DIAN) en StatsPage

Extender la pantalla `StatsPage` existente con un panel de reporte de ventas descargable, útil para declaración de renta/IVA ante la DIAN. No se crea pantalla nueva — el reporte vive como una sección adicional dentro de la pestaña "Stats".

### Filtros disponibles

| Filtro | Opciones | Default |
|--------|----------|---------|
| Período | Día, Semana, Mes, Año, Rango personalizado | Mes |
| Fecha inicio | date picker | primer día del mes actual |
| Fecha fin | date picker | hoy |
| Estado de orden | delivered, cancelled, all | delivered |
| Tipo de orden | delivery, pickup, all | all |
| Método de pago | cash, nequi, all | all |

### Datos del reporte

```typescript
interface SalesReport {
  period: { from: string; to: string };
  summary: {
    totalOrders: number;
    totalRevenue: number;
    totalDeliveryFees: number;
    averageOrderValue: number;
    byPaymentMethod: { method: 'cash' | 'nequi'; count: number; revenue: number }[];
    byOrderType: { type: 'delivery' | 'pickup'; count: number; revenue: number }[];
    byDay: { date: string; count: number; revenue: number }[];
  };
  orders: Array<{
    id: string;
    date: string;
    customer: string;
    total: number;
    paymentMethod: string;
    type: string;
    status: string;
  }>;
}
```

### Endpoints

**`GET /api/v1/orders/reports/sales`**

Query params:
| Param | Tipo | Requerido | Default | Descripción |
|-------|------|-----------|---------|-------------|
| `from` | string (YYYY-MM-DD) | sí | — | Fecha inicio del reporte |
| `to` | string (YYYY-MM-DD) | sí | — | Fecha fin del reporte |
| `status` | string | no | `delivered` | Estado de la orden (pending, confirmed, preparing, ready, delivered, cancelled, all) |
| `paymentMethod` | string | no | `all` | Método de pago (cash, nequi, all) |
| `type` | string | no | `all` | Tipo de orden (delivery, pickup, all) |
| `page` | number | no | `1` | Página de resultados |
| `limit` | number | no | `10` | Órdenes por página (max 50) |

Respuesta:
```json
{
  "summary": {
    "totalOrders": 24,
    "totalRevenue": 580000,
    "totalDeliveryFees": 72000,
    "averageOrderValue": 24167,
    "byPaymentMethod": [
      { "method": "cash", "count": 14, "revenue": 320000 },
      { "method": "nequi", "count": 10, "revenue": 260000 }
    ],
    "byOrderType": [
      { "type": "delivery", "count": 18, "revenue": 508000 },
      { "type": "pickup", "count": 6, "revenue": 72000 }
    ],
    "byDay": [
      { "date": "2026-06-17", "count": 2, "revenue": 57000 }
    ]
  },
  "orders": [
    {
      "id": "SH-042",
      "date": "2026-06-17T14:30:00Z",
      "customer": "Juan Perez",
      "total": 25000,
      "paymentMethod": "cash",
      "type": "delivery",
      "status": "delivered"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 24,
    "totalPages": 3
  }
}
```

**`POST /api/v1/orders/reports/export`**

Body:
```json
{
  "format": "csv",
  "filters": {
    "from": "2026-06-01",
    "to": "2026-06-30",
    "status": "delivered",
    "paymentMethod": "all",
    "type": "all"
  }
}
```

Respuesta (descarga directa):
- `format: 'csv'` → `Content-Type: text/csv; attachment` con **todas** las órdenes del período (sin paginación), formato para auditoría detallada en Excel
- `format: 'pdf'` → `Content-Type: application/pdf; attachment` con **solo resumen** (2 páginas max), formato para presentación a contador/DIAN

> **Nota:** El CSV devuelve todas las órdenes del período sin paginación. El PDF es solo resumen ejecutivo para evitar archivos de cientos de páginas cuando el negocio crezca.

### Formato de exportación

**CSV:**
```csv
Fecha,Orden,Cliente,Total,Metodo,Tipo,Estado
2026-06-17,SH-042,Juan Perez,25000,cash,delivery,delivered
```

**PDF (resumen ejecutivo, 2 páginas máx):**
- Encabezado: "Arrocería Shanti — Reporte de Ventas" + rango de fechas
- Tabla resumen con totales (órdenes, ingresos, ticket promedio, delivery fees)
- Desglose por método de pago (efectivo vs Nequi)
- Desglose por tipo de orden (delivery vs pickup)
- Gráfico de barras: ingresos por día del período
- Pie de página con fecha de generación

> El PDF **no incluye** tabla detallada de órdenes individuales. Use CSV para el detalle completo.

### Wireframe: Reporte de Ingresos en StatsPage

```
┌─────────────────────────────┐
│ 📊 Estadísticas              │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │  Hoy   │   Reporte 📈  │ │  ← toggle tabs
│ └─────────────────────────┘ │
├─────────────────────────────┤
│  📅 Junio 2026              │
│  Del 01/06 al 30/06       │
├─────────────────────────────┤
│ 💰 Total ventas    │ 24 ord │
│    $580.000        │ $24.2k │
├─────────────────────────────┤
│ 💵 Efectivo  │ 💳 Nequi    │
│   $320.000   │  $260.000   │
├─────────────────────────────┤
│ 📦 Delivery  │ 🏠 Pickup   │
│   18 ord     │   6 ord     │
├─────────────────────────────┤
│ 📈 Ingresos por día:       │
│ ▓▓▓▓▓▓░░░░░  $45k lun     │
│ ▓▓▓▓▓░░░░░░  $38k mar     │
│ ▓▓▓▓▓▓▓░░░░  $62k mié     │
│ ▓▓▓░░░░░░░░  $28k jue     │
├─────────────────────────────┤
│ Detalle de órdenes (1-10): │
│ • SH-042 — $25.000 — 17/06 │
│ • SH-041 — $32.000 — 17/06 │
│ • SH-038 — $18.000 — 16/06 │
│ • SH-037 — $42.000 — 15/06 │
│ • SH-036 — $19.000 — 15/06 │
│ • SH-035 — $28.000 — 14/06 │
│ • SH-034 — $35.000 — 14/06 │
│ • SH-033 — $22.000 — 13/06 │
│ • SH-032 — $30.000 — 13/06 │
│ • SH-031 — $17.000 — 12/06 │
│   ┌─────────────────────┐   │
│   │  ← 1 de 3  →       │   │  ← paginación
│   └─────────────────────┘   │
├─────────────────────────────┤
│ [📄 CSV]  [📄 PDF]  [🖨️]   │
├─────────────────────────────┤
│ 📋Pedidos│📊Stats│🛵Equipo│🍚Menú│
└─────────────────────────────┘
```

### Integración en StatsPage

La pestaña "Stats" tiene dos modos visibles mediante un toggle o tabs secundarios:

**Modo "Hoy" (vista actual):**
- Cards de resumen del día (total, pending, confirmed, etc.)
- Sin cambios respecto a v1.5

**Modo "Reporte" (nuevo):**
- Selector de período con tabs (Día/Semana/Mes/Año/Custom)
- Date pickers para rango personalizado
- Filtros rápidos (estado, método de pago, tipo de orden)
- Cards de resumen del período filtrado (total ventas, # órdenes, ticket promedio, delivery fees)
- Gráfico de barras simple: ingresos por día dentro del rango
- Tabla de órdenes con scroll
- Botón "Exportar CSV" y "Exportar PDF" (descarga directa del navegador)
- Botón "Imprimir" (abre `window.print()` con estilos optimizados)

### Notas

- Solo accesible para rol `admin`
- Las órdenes canceladas pueden excluirse del reporte por defecto
- La fecha de referencia es `created_at` (fecha de creación de la orden)
- `todayRevenue` del dashboard actual se mantiene pero usa `delivered_at` cuando exista
