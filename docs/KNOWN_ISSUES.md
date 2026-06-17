# Problemas Conocidos y Roadmap

## Estado: v1.3 — Pedidos paginados + seguridad documentada

---

## ✅ Arreglado en v1.1

| # | Problema | Fix |
|---|----------|-----|
| 1 | Nombre del cliente hardcodeado | Paso `name` + recuperación de DB para clientes recurrentes |
| 2 | Personalizaciones limitadas a una | `handleCustomization` parsea números separados por coma (`1,3`) |
| 3 | Sin opción de "atras" o "cancelar" | Todos los handlers aceptan `0`, `atras` o `volver` |
| 4 | Modificar pedido no implementado | `handleModify` con 4 opciones funcionales |
| 5 | Búsqueda de producto por nombre frágil | Lista numerada en `showProductList()`, selección por número |
| 6 | Input inválido confirma/cambia pedido | Validación estricta en `delivery_type`, `payment`, `confirm` |
| 7 | Phone normalization inconsistente | `handleMessage` normaliza `573011758999` → `3011758999`. DB busca los 3 formatos. |
| 8 | Carrito vacío al hacer "atras" en add_more | Protección contra `pop()` en array vacío |

## ✅ Arreglado en v1.2

| # | Problema | Fix |
|---|----------|-----|
| 9 | Dirección no validada (solo longitud) | Regex completo para formatos colombianos — barrio/sector obligatorio en direcciones de calle |
| 10 | Modificar pedido pedía dirección de nuevo | `handleAddMore` salta `delivery_type` si `session.type` ya está definido |
| 11 | Dirección del restaurante hardcodeada | Variable de entorno `BUSINESS_ADDRESS` con fallback |
| 12 | Sin paso de notas de entrega | Nuevo step `delivery_notes` (opcional, se puede omitir) |
| 13 | Sin reutilización de dirección previa | Consulta a DB al elegir domicilio — step `address_confirm` si hay dirección previa |

## ✅ Arreglado en v1.3

| # | Problema | Fix |
|---|----------|-----|
| 14 | Estado de pedido mostraba solo una orden | `findAllPendingByCustomer` + vista detalle + lista compacta paginada |

---

## 💡 Pendiente

### P1. Sin manejo de ubicación GPS
**Problema**: `handleAddress` solo acepta texto. No procesa `message.location` de WhatsApp.
**Impacto**: Usuario no puede compartir ubicación en vivo para domicilio.
**Solución**: Procesar `type: 'location'` en el webhook y extraer coordenadas.

### P2. Sin plantillas de mensajes aprobados (Meta)
**Problema**: Para notificaciones iniciadas por el negocio, Meta requiere plantillas pre-aprobadas.
**Impacto**: El bot no puede notificar proactivamente al cliente cuando el pedido está listo.
**Solución**: Crear plantillas en Meta Business Manager. Cubierto parcialmente por el **admin dashboard** (fase siguiente).

### P3. Sesiones en memoria (no persistentes)
**Problema**: `sessions = new Map<string, Session>()` se pierde si el servidor reinicia.
**Impacto**: Usuario a mitad de pedido pierde progreso.
**Solución**: Migrar sesiones a Redis o PostgreSQL.

### P4. Sin validación de horario de atención
**Problema**: El bot acepta pedidos 24/7.
**Impacto**: Pedidos en horario cerrado que nadie va a preparar.
**Solución**: Variable de entorno `BUSINESS_HOURS` y rechazo fuera de horario.

### P5. Pedidos grandes sin revisión humana
**Problema**: Pedidos con `total >= 50000` o más de 3 ítems quedan en `pending` sin que nadie los revise.
**Impacto**: Pedidos grandes pueden quedar olvidados.
**Solución**: **Admin dashboard** (fase siguiente) — el administrador verá y gestionará estos pedidos.

### P6. API de órdenes sin autenticación
**Problema**: Ver `docs/SECURITY.md` — issues #1, #2, #3.
**Solución**: JWT en fase admin dashboard + verificación HMAC webhook Meta.

---

## Roadmap

| Versión | Objetivo | Issues |
|---------|----------|--------|
| v1.1 | Flujo robusto | #1–8 ✅ |
| v1.2 | UX mejorada + validaciones | #9–13 ✅ |
| v1.3 | Estado paginado | #14 ✅ |
| v1.4 | **Admin dashboard (en progreso)** | P5, P6 — JWT + CRUD pedidos + estadísticas |
| v2.0 | Producción | P2, P3, P4 — plantillas Meta, sesiones persistentes, horarios |
