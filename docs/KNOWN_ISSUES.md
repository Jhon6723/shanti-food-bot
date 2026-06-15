# Problemas Conocidos y Roadmap

## Estado: v1.1 — Flujo robusto

El bot ahora tiene fallbacks en cada paso y valida todas las entradas del usuario.

---

## ✅ Arreglado en v1.1

| # | Problema | Fix |
|---|----------|-----|
| 1 | Nombre del cliente hardcodeado | Paso `name` + recuperacion de DB para clientes recurrentes |
| 2 | Personalizaciones limitadas a una | `handleCustomization` parsea numeros separados por coma (`1,3`) |
| 3 | Sin opcion de "atras" o "cancelar" | Todos los handlers aceptan `0`, `atras` o `volver` |
| 4 | Modificar pedido no implementado | `handleModify` con 4 opciones funcionales |
| 5 | Busqueda de producto por nombre fragil | Lista numerada en `showProductList()`, seleccion por numero |
| 6 | Input invalido confirma/cambia pedido | Validacion estricta en `delivery_type`, `payment`, `confirm` |
| 7 | Phone normalization inconsistente | `handleMessage` normaliza `573011758999` → `3011758999`. DB busca los 3 formatos. |
| 8 | Carrito vacio al hacer "atras" en add_more | Proteccion contra `pop()` en array vacio |

---

## 💡 Bajo (Mejoras deseables)

### 6. Sin manejo de ubicacion GPS
**Problema**: En `handleAddress`, el bot solo acepta texto. No procesa `message.location` de WhatsApp.
**Impacto**: Usuario no puede compartir ubicacion en vivo para domicilio.
**Solucion**: En `handleDeliveryType`, preguntar "¿Enviar ubicacion o escribir direccion?" y procesar `type: 'location'`.

### 7. Sin plantillas de mensajes aprobados
**Problema**: Para mensajes iniciados por el negocio (notificaciones de estado), Meta requiere plantillas pre-aprobadas.
**Impacto**: El bot solo puede responder mensajes entrantes. No puede notificar al cliente cuando el pedido esta listo.
**Solucion**: Crear plantillas en Meta Business Manager para:
- "Pedido confirmado"
- "Pedido listo para entrega"
- "Pedido en camino"

### 8. Sesiones en memoria (no persistentes)
**Problema**: `sessions = new Map<string, Session>()` se pierde si el servidor reinicia.
**Impacto**: Usuario que estaba a mitad de pedido pierde progreso.
**Solucion**: Migrar sesiones a Redis o PostgreSQL.

### 9. Sin validacion de horario de atencion
**Problema**: El bot acepta pedidos 24/7. No verifica si el restaurante esta abierto.
**Impacto**: Pedidos a medianoche que nadie va a preparar.
**Solucion**: Agregar horario de atencion en `.env` y rechazar pedidos fuera de horario.

### 10. Sin confirmacion humana para pedidos complejos
**Problema**: El auto-confirm (`total < 50000 && items.length <= 3`) funciona, pero pedidos grandes pasan a `pending` y nadie los revisa.
**Impacto**: Pedidos grandes pueden quedar olvidados sin confirmacion humana.
**Solucion**: Panel de administracion o notificaciones (email/SMS) para pedidos `pending`.

---

## Roadmap

| Version | Objetivo | Issues |
|---------|----------|--------|
| v1.1 | Flujo robusto | #1, #3, #4, #5 |
| v1.2 | UX mejorada | #2, #6, #8 |
| v1.3 | Admin panel | #7, #10 |
| v2.0 | Produccion | #9, plantillas, analytics |
