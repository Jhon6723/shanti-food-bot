# Flujos de Conversación WhatsApp

## Flujo Principal: Nuevo Pedido

```
Usuario: "Hola" o cualquier mensaje
Bot: "¡Hola! Bienvenido a Arrocería Shanti 🍚

¿Qué deseas ordenar hoy?
1. Ver menú completo
2. Hacer pedido rápido
3. Estado de mi pedido
4. Hablar con alguien"
```

### Opción 1: Ver Menú

```
Bot: "*Arroces Chinos:*
• Arroz Chino de Pollo - $18.000
• Arroz Chino de Cerdo - $20.000  
• Arroz Chino de Camarón - $24.000
• Arroz Chino Especial - $28.000

*Bandejas:*
• Bandeja Paisa - $22.000
• Bandeja de Pollo - $20.000

*Bebidas:*
• Coca-Cola 400ml - $4.000
• Jugos naturales - $6.000

Escribe el número o nombre del producto que deseas."
```

### Opción 2: Selección de Producto

```
Usuario: "Arroz chino de pollo"
Bot: "Arroz Chino de Pollo - $18.000

¿Alguna personalización?
• Sin cebolla
• Sin ají
• Extra pollo (+$3.000)
• Ninguna

Responde con el número o escribe tu preferencia."
```

### Opción 3: Cantidad

```
Bot: "¿Cuántas porciones de Arroz Chino de Pollo?"
Usuario: "2"
Bot: "Agregado: 2x Arroz Chino de Pollo = $36.000

¿Deseas agregar algo más?
1. Sí, ver menú
2. No, finalizar pedido"
```

### Opción 4: Tipo de Entrega

```
Bot: "Perfecto. Total hasta ahora: $36.000

¿Cómo deseas recibir tu pedido?
1. 🛵 Domicilio (+$3.000)
2. 🏪 Recoger en restaurante"
```

### Opción 5a: Si es Domicilio (cliente sin dirección previa)

```
Bot: "📍 Por favor escribe tu dirección de entrega.

Ejemplos:
• Carrera 45 #12-34, Barrio Centro
• Manzana 5 Casa 12, Urb. Los Almendros
• Km 4 vía al Norte"
```

### Opción 5b: Si es Domicilio (cliente con dirección previa en DB)

```
Bot: "📍 Tu última dirección de entrega fue:
Carrera 45 #12-34, Barrio Centro

¿Deseas usarla?
1️⃣ Sí, usar esta dirección
2️⃣ No, escribir nueva dirección"
```

### Opción 5c: Notas de entrega (opcional, tras confirmar dirección)

```
Bot: "📝 ¿Alguna nota para la entrega?

Por ejemplo: 'Casa verde, timbre roto, llamar al llegar'

_(Escribe tu nota o envía *omitir* para continuar)_"
```

### Opción 6: Método de Pago

```
Bot: "¿Método de pago?
1. 💵 Efectivo (contra entrega)
2. 📱 Nequi (transferencia)

Si seleccionas Nequi, te enviaremos el número para transferir."
```

### Opción 7: Confirmación

```
Bot: "*Resumen de tu pedido:*

🍚 2x Arroz Chino de Pollo - $36.000
🛵 Domicilio - $3.000
💰 *Total: $39.000*
📍 Entrega: Carrera 45 #12-34
💳 Pago: Efectivo

Tiempo estimado: 25-30 minutos

¿Confirmas el pedido?
1. ✅ Sí, confirmar
2. ❌ Cancelar
3. ✏️ Modificar"
```

### Confirmación Exitosa

```
Bot: "✅ *¡Pedido confirmado!*

Número de orden: *#SH-001*

⏱️ Tiempo estimado: 25-30 minutos
📞 Te contactaremos al 3123456789

Gracias por preferir Arrocería Shanti 🍚"
```

## Flujo: Estado de Pedido

### Un solo pedido activo

```
Usuario: "estado" o "3" desde menú principal
Bot: "🛵 *Pedido #SH-001*

Estado: ✅ Confirmado

*Productos:*
• 2x Arroz Chino de Pollo — $36.000

Total: $39.000
Tipo: Domicilio

Te notificaremos cuando haya actualizaciones. 📲"
```

### Múltiples pedidos activos (hasta 5)

```
Bot: "🛵 *Pedido #SH-005* (el más reciente, en detalle)
...

─────────────────────
*Otros pedidos activos:*
🛵 #SH-004 — ✅ Confirmado — $39.000
🛵 #SH-003 — 🍳 En preparación — $22.000
📦 #SH-002 — ⏳ Pendiente — $18.000
📦 #SH-001 — 🎉 Listo para entrega — $25.000"
```

### Más de 5 pedidos activos (paginación)

```
Bot: "(detalle del más reciente + 4 compactos)

1️⃣ Ver más (N pedidos más)
0️⃣ Volver al menú"

Usuario: "1"
Bot: "📋 *Más pedidos activos (6–9 de 10)*

🛵 #SH-006 — ⏳ Pendiente — $39.000
...

1️⃣ Ver más
0️⃣ Volver al menú"
```

## Flujo: Notificaciones del Restaurante

### Pedido Listo (Pickup)
```
Bot: "🎉 ¡Tu pedido #SH-001 está listo!

Puedes pasar a recogerlo.
Gracias por tu preferencia 🍚"
```

### Pedido en Camino (Delivery)
```
Bot: "🛵 ¡Tu pedido #SH-001 va en camino!

Llegada estimada: 10 minutos
Pago: $39.000 en efectivo

Buen provecho 🍚"
```

## Flujo: Cancelación

```
Usuario: "Cancelar pedido #SH-001"
Bot: "¿Estás seguro de cancelar el pedido #SH-001?
1. Sí, cancelar
2. No, mantener pedido"

[Si sí]: "Pedido cancelado. Puedes hacer un nuevo pedido cuando quieras."
```

## Edge Cases

### Producto Agotado
```
Bot: "Lo sentimos, Arroz Chino de Camarón no está disponible en este momento.

Alternativas:
1. Arroz Chino Especial (tiene camarón + pollo)
2. Arroz Chino de Pollo
3. Ver otros productos"
```

### Fuera de Horario
```
Bot: "Nuestro horario de atención es:
🕐 Lunes a Sábado: 11:00 AM - 9:00 PM
🕐 Domingos: 12:00 PM - 4:00 PM

Por favor escribe tu pedido y lo procesaremos al abrir 🍚"
```

### Hablar con Humano
```
Bot: "Un momento, te conectamos con el restaurante..."
[Notifica al admin vía WhatsApp/Telegram]
```
