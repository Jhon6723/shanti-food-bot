// WhatsApp Bot — implements whatsapp-flows.md
// Handles conversational flows for order management

import type { OrderRepositoryPort } from '../application/ports/OrderRepositoryPort.js';
import type { ProductRepositoryPort, ProductRow } from '../application/ports/ProductRepositoryPort.js';
import { sseService } from '../application/SSEService.js';
import { Order } from '../domain/models/Order.js';
import type { OrderItemData, OrderType, PaymentMethod } from '../types/index.js';

type BotStep =
  | null
  | 'menu'
  | 'name'
  | 'product'
  | 'customization'
  | 'quantity'
  | 'add_more'
  | 'delivery_type'
  | 'address'
  | 'address_confirm'
  | 'delivery_notes'
  | 'payment'
  | 'confirm'
  | 'modify'
  | 'order_status';

interface SessionState {
  step: BotStep;
  items: OrderItemData[];
  subtotal: number;
  total: number;
  type: OrderType | null;
  address: string | null;
  lastAddress: string | null;
  deliveryNotes: string | null;
  paymentMethod: PaymentMethod | null;
  currentProduct: ProductRow | null;
  pendingItem: OrderItemData | null;
  customerName: string | null;
  orderStatusCache: Order[] | null;
  orderStatusPage: number;
}

class Session {
  step: BotStep = null;
  items: OrderItemData[] = [];
  subtotal = 0;
  total = 0;
  type: OrderType | null = null;
  address: string | null = null;
  lastAddress: string | null = null;
  deliveryNotes: string | null = null;
  paymentMethod: PaymentMethod | null = null;
  currentProduct: ProductRow | null = null;
  pendingItem: OrderItemData | null = null;
  customerName: string | null = null;
  chatId: string | null = null;
  orderStatusCache: Order[] | null = null;
  orderStatusPage = 0;

  constructor(readonly phone: string) {}

  reset(): void {
    this.step = null;
    this.items = [];
    this.subtotal = 0;
    this.total = 0;
    this.type = null;
    this.address = null;
    this.lastAddress = null;
    this.deliveryNotes = null;
    this.paymentMethod = null;
    this.currentProduct = null;
    this.pendingItem = null;
    this.customerName = null;
    this.chatId = null;
    this.orderStatusCache = null;
    this.orderStatusPage = 0;
  }
}

export class WhatsAppBot {
  private readonly deliveryFee = 3000;
  private readonly restaurantAddress = process.env.BUSINESS_ADDRESS ?? 'Consultar dirección con el restaurante';
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly orderRepo: OrderRepositoryPort,
    private readonly productRepo: ProductRepositoryPort
  ) {}

  async handleMessage(
    rawFrom: string,
    message: { text?: { body: string }; type?: string; interactive?: { type: string; buttonReply?: Record<string, unknown>; listReply?: Record<string, unknown> } },
    chatId?: string
  ): Promise<string> {
    // Normalize Colombian phone: 573011758999 → 3011758999
    const from = rawFrom.replace(/^57/, '').replace(/\D/g, '');
    const session = this.getOrCreateSession(from);
    if (chatId) {
      session.chatId = chatId;
    }
    const text = message.text?.body.toLowerCase().trim() ?? '';

    if (text === 'hola' || text === 'inicio' || text === 'empezar') {
      session.reset();
      const savedName = await this.orderRepo.getCustomerNameByPhone(from);
      // 'Cliente' is a fallback placeholder, not a real saved name
      if (savedName && savedName.trim().toLowerCase() !== 'cliente') {
        session.customerName = savedName;
        return `¡Hola de nuevo, *${savedName}*! 🍚\n\n¿Qué deseas ordenar hoy?\n\n1️⃣ Ver menú completo\n2️⃣ Hacer pedido rápido\n3️⃣ Estado de mi pedido\n4️⃣ Hablar con alguien\n\nResponde con el número de la opción.`;
      }
      return this.welcomeMessage();
    }

    if (text.includes('estado')) {
      return await this.checkOrderStatus(from, session);
    }

    if (!session.step) {
      if (text === '0' || text === 'atras' || text === 'volver') {
        if (session.customerName) {
          return `¡Hola de nuevo, *${session.customerName}*! 🍚\n\n¿Qué deseas ordenar hoy?\n\n1️⃣ Ver menú completo\n2️⃣ Hacer pedido rápido\n3️⃣ Estado de mi pedido\n4️⃣ Hablar con alguien\n\nResponde con el número de la opción.`;
        }
        return this.welcomeMessage();
      }
      return await this.handleMainMenu(text, session);
    }

    switch (session.step) {
      case 'menu':
        return this.handleProductSelection(text, session);
      case 'name':
        return this.handleName(text, session);
      case 'product':
        return this.handleProductSelection(text, session);
      case 'customization':
        return this.handleCustomization(text, session);
      case 'quantity':
        return this.handleQuantity(text, session);
      case 'add_more':
        return this.handleAddMore(text, session);
      case 'delivery_type':
        return await this.handleDeliveryType(text, session, from);
      case 'address':
        return this.handleAddress(text, session);
      case 'address_confirm':
        return this.handleAddressConfirm(text, session);
      case 'delivery_notes':
        return this.handleDeliveryNotes(text, session);
      case 'payment':
        return this.handlePayment(text, session);
      case 'confirm':
        return await this.handleConfirmation(text, session, from);
      case 'modify':
        return this.handleModify(text, session);
      case 'order_status':
        return this.handleOrderStatus(text, session);
      default:
        session.reset();
        return this.welcomeMessage();
    }
  }

  private getOrCreateSession(phone: string): Session {
    if (!this.sessions.has(phone)) {
      this.sessions.set(phone, new Session(phone));
    }
    return this.sessions.get(phone)!;
  }

  private welcomeMessage(): string {
    return `¡Hola! Bienvenido a Arrocería Shanti 🍚

¿Qué deseas ordenar hoy?

1️⃣ Ver menú completo
2️⃣ Hacer pedido rápido
3️⃣ Estado de mi pedido
4️⃣ Hablar con alguien

Responde con el número de la opción.`;
  }

  private async handleMainMenu(text: string, session: Session): Promise<string> {
    switch (text) {
      case '1':
      case 'menu':
        session.step = 'menu';
        return await this.showFullMenu();
      case '2':
      case 'pedido':
      case 'ordenar':
        if (session.customerName) {
          session.step = 'product';
          return `¡Hola *${session.customerName}*! 👋\n\n${await this.showProductList()}\n\nResponde con el numero del producto que deseas.`;
        }
        session.step = 'name';
        return `📝 *Antes de ordenar...*\n\n¿Cual es tu nombre?\n\n(Escribe tu nombre para continuar)`;
      case '3':
      case 'estado':
        return await this.checkOrderStatus(session.phone, session);
      case '4':
      case 'ayuda':
      case 'humano':
        return `🔄 Te estamos conectando con el restaurante...\n\nPor favor espera un momento.`;
      default:
        return this.welcomeMessage();
    }
  }

  private async handleName(text: string, session: Session): Promise<string> {
    const name = text.trim();
    if (name.length < 2) {
      return `Por favor escribe tu nombre real (al menos 2 letras).\n\n¿Cual es tu nombre?`;
    }
    session.customerName = name;
    session.step = 'product';
    return `¡Hola *${name}*! 👋\n\n${await this.showProductList()}\n\nResponde con el numero del producto que deseas.`;
  }

  private async showFullMenu(): Promise<string> {
    const arroces = await this.productRepo.findByCategory('arroz_chino', true);
    const bandejas = await this.productRepo.findByCategory('bandeja_paisa', true);
    const bebidas = await this.productRepo.findByCategory('bebidas', true);

    let menu = `*🍚 MENÚ ARROCERÍA SHANTI 🍚*\n\n`;
    menu += `*Arroces Chinos:*\n`;
    arroces.forEach((p: ProductRow) => { menu += `• ${p.name} - $${p.price.toLocaleString()}\n`; });
    menu += `\n*Bandejas:*\n`;
    bandejas.forEach((p: ProductRow) => { menu += `• ${p.name} - $${p.price.toLocaleString()}\n`; });
    menu += `\n*Bebidas:*\n`;
    bebidas.forEach((p: ProductRow) => { menu += `• ${p.name} - $${p.price.toLocaleString()}\n`; });
    menu += `\n🛵 Domicilio: $3.000 adicional\n\n📌 Para ordenar, escribe el *nombre* del producto o escribe *pedido* para ver la lista numerada.`;
    return menu;
  }

  private async showProductList(): Promise<string> {
    const all = await this.productRepo.findAll(false);
    let list = `*📋 MENÚ — Selecciona un número:*\n\n`;
    all.forEach((p: ProductRow, i: number) => {
      list += `${i + 1}. ${p.name} — $${p.price.toLocaleString()}\n`;
    });
    return list;
  }

  private async handleProductSelection(text: string, session: Session): Promise<string> {
    if (text === '0' || text === 'atras' || text === 'volver') {
      if (session.step === 'menu') {
        session.step = null;
        return this.welcomeMessage();
      }
      if (session.customerName) {
        session.step = null;
        return this.welcomeMessage();
      }
      session.step = 'name';
      return `📝 ¿Cual es tu nombre?\n\n(Escribe tu nombre o "hola" para reiniciar)`;
    }

    const all = await this.productRepo.findAll(false);
    const idx = parseInt(text) - 1;
    let product: ProductRow | undefined;

    if (!isNaN(idx) && idx >= 0 && idx < all.length) {
      product = all[idx];
    } else {
      const found = await this.productRepo.findAll(false);
      product = found.find((p: ProductRow) => p.name.toLowerCase().includes(text) || p.id === text);
    }

    if (!product) {
      return `❌ No encontré ese producto.\n\n${await this.showProductList()}\n\nResponde con el *número* del producto.`;
    }
    if (!product.available) {
      return `Lo sentimos, ${product.name} no está disponible en este momento.\n\n${await this.showProductList()}`;
    }

    session.currentProduct = product;
    session.step = 'customization';

    let msg = `*${product.name}* — $${product.price.toLocaleString()}\n\n`;
    const opts = product.customization_options ?? [];
    if (opts.length > 0) {
      msg += `¿Alguna personalización? (puedes elegir varias)\n`;
      opts.forEach((opt: string, i: number) => { msg += `${i + 1}. ${opt}\n`; });
      msg += `${opts.length + 1}. Ninguna\n\nResponde con números separados por coma (ej: *1,3*) o escribe tu preferencia.`;
    } else {
      session.pendingItem = {
        productId: product.id,
        quantity: 0,
        customizations: [],
        unitPrice: product.price,
        preparationMinutes: product.preparation_minutes,
      };
      session.step = 'quantity';
      msg += `¿Cuántas ${this.quantityLabel(session)} deseas?\n\n_(Escribe *0* o *volver* para regresar)_`;
    }
    return msg;
  }

  private async handleCustomization(text: string, session: Session): Promise<string> {
    if (text === '0' || text === 'atras' || text === 'volver') {
      session.step = 'product';
      return `${await this.showProductList()}\n\nResponde con el número del producto.\n\n_(Escribe *0* o *volver* para regresar)_`;
    }

    const options = session.currentProduct!.customization_options ?? [];
    const ningunaIdx = options.length + 1; // e.g. option 3 = Ninguna

    // Parse comma-separated numbers (e.g. "1,3") or single number
    const nums = text.split(',').map((s) => parseInt(s.trim())).filter((n) => !isNaN(n));
    const hasNinguna = nums.includes(ningunaIdx) || text.toLowerCase().includes('ninguna') || text.toLowerCase().includes('no');

    const customizations: string[] = [];
    const validNums = nums.filter((n) => n > 0 && n <= options.length);

    if (validNums.length > 0 && !hasNinguna) {
      for (const num of validNums) {
        customizations.push(options[num - 1]);
      }
    } else if (validNums.length === 0 && !hasNinguna) {
      // Free text customization only if no numbers were provided at all
      customizations.push(text);
    }

    // If user typed numbers but none were valid, warn them
    if (nums.length > 0 && validNums.length === 0 && !hasNinguna) {
      let msg = `❌ No reconocí ninguna opción válida.\n\n¿Alguna personalización?\n`;
      options.forEach((opt: string, i: number) => { msg += `${i + 1}. ${opt}\n`; });
      msg += `${options.length + 1}. Ninguna\n\nResponde con números separados por coma.`;
      return msg;
    }

    session.pendingItem = {
      productId: session.currentProduct!.id,
      quantity: 0,
      customizations,
      unitPrice: session.currentProduct!.price,
      preparationMinutes: session.currentProduct!.preparation_minutes,
    };
    session.step = 'quantity';
    return `¿Cuántas ${this.quantityLabel(session)} de *${session.currentProduct!.name}* deseas?\n\n_(Escribe *0* o *volver* para regresar)_`;
  }

  private quantityLabel(session: Session): string {
    return session.currentProduct?.category_id === 'bebidas' ? 'unidades' : 'porciones';
  }

  private async handleQuantity(text: string, session: Session): Promise<string> {
    if (text === '0' || text === 'atras' || text === 'volver') {
      session.step = 'customization';
      const opts = session.currentProduct!.customization_options ?? [];
      let msg = '';
      if (session.items.length > 0) {
        msg += `🛒 *Carrito actual:*\n`;
        for (const item of session.items) {
          const p = await this.productRepo.findById(item.productId);
          msg += `• ${item.quantity}x ${p?.name ?? item.productId} — $${((item.unitPrice ?? 0) * item.quantity).toLocaleString()}\n`;
        }
        msg += `\n`;
      }
      msg += `¿Alguna personalización? (puedes elegir varias)\n`;
      opts.forEach((opt: string, i: number) => { msg += `${i + 1}. ${opt}\n`; });
      msg += `${opts.length + 1}. Ninguna\n\nResponde con números separados por coma.`;
      return msg;
    }

    const quantity = parseInt(text);
    if (isNaN(quantity) || quantity < 1) {
      return `Por favor ingresa un número válido mayor a 0.`;
    }
    if (quantity > 20) {
      return `⚠️ La cantidad máxima por producto es 20.\n\n¿Cuántas ${this.quantityLabel(session)} de *${session.currentProduct!.name}* deseas?`;
    }

    session.pendingItem!.quantity = quantity;
    session.items.push(session.pendingItem!);

    const itemTotal = session.pendingItem!.unitPrice! * quantity;
    session.subtotal += itemTotal;

    session.step = 'add_more';
    return `✅ Agregado: ${quantity}x ${session.currentProduct!.name} = $${itemTotal.toLocaleString()}\n\n*Total hasta ahora: $${session.subtotal.toLocaleString()}*\n\n¿Deseas agregar algo más?\n\n1️⃣ Sí, ver menú\n2️⃣ No, finalizar pedido`;
  }

  private async handleAddMore(text: string, session: Session): Promise<string> {
    if (text === '0' || text === 'atras' || text === 'volver') {
      if (session.items.length === 0) {
        session.step = 'product';
        return `${await this.showProductList()}\n\nTu carrito está vacío. Responde con el número del producto.\n\n_(Escribe *0* o *volver* para regresar)_`;
      }
      const removed = session.items.pop()!;
      session.subtotal -= removed.unitPrice! * removed.quantity;
      session.currentProduct = await this.productRepo.findById(removed.productId) ?? null;
      session.pendingItem = { ...removed, quantity: 0 };
      session.step = 'quantity';
      return `Producto eliminado del carrito.\n\n¿Cuántas porciones de *${session.currentProduct?.name ?? 'este producto'}* deseas?\n\n_(Escribe *0* o *volver* para regresar)_`;
    }

    if (text === '1' || text === 'si' || text === 'sí' || text === 'menu') {
      session.currentProduct = null;
      session.pendingItem = null;
      session.step = 'product';
      return `${await this.showProductList()}\n\nResponde con el número del producto.\n\n_(Escribe *0* o *volver* para regresar)_`;
    }
    if (text === '2' || text === 'no' || text === 'finalizar') {
      if (session.type) {
        session.total = session.subtotal + (session.type === 'delivery' ? this.deliveryFee : 0);
        session.step = 'confirm';
        return await this.showOrderSummary(session);
      }
      session.step = 'delivery_type';
      return `Perfecto. *Total de productos: $${session.subtotal.toLocaleString()}*\n\n¿Cómo deseas recibir tu pedido?\n\n1️⃣ 🛵 Domicilio (+$3.000)\n2️⃣ 🏪 Recoger en restaurante\n\n_(Escribe *0* o *volver* para regresar)_`;
    }
    return `Opción no reconocida.\n\n*Total hasta ahora: $${session.subtotal.toLocaleString()}*\n\n¿Deseas agregar algo más?\n\n1️⃣ Sí, ver menú\n2️⃣ No, finalizar pedido\n\n_(Escribe *0* o *volver* para regresar)_`;
  }

  private async handleDeliveryType(text: string, session: Session, from: string): Promise<string> {
    if (text === '0' || text === 'atras' || text === 'volver') {
      session.step = 'add_more';
      return `*Total hasta ahora: $${session.subtotal.toLocaleString()}*\n\n¿Deseas agregar algo más?\n\n1️⃣ Sí, ver menú\n2️⃣ No, finalizar pedido`;
    }

    if (text === '1' || text.includes('domicilio')) {
      session.type = 'delivery';
      session.total = session.subtotal + this.deliveryFee;
      const lastAddress = await this.orderRepo.findLastDeliveryAddress(from);  // eslint-disable-line
      if (lastAddress) {
        session.lastAddress = lastAddress;
        session.step = 'address_confirm';
        return `🛵 *Domicilio seleccionado*\n\nTu última dirección de entrega fue:\n📍 *${lastAddress}*\n\n1️⃣ Usar esta dirección\n2️⃣ Escribir una dirección nueva\n\n_(Escribe *0* o *volver* para regresar)_`;
      }
      session.step = 'address';
      return `🛵 *Domicilio seleccionado*\n\nPor favor comparte tu ubicación o escribe la dirección completa de entrega:\n\nEjemplo: "Carrera 45 #12-34, Barrio San Fernando"\n\n_(Escribe *0* o *volver* para regresar)_`;
    }
    if (text === '2' || text.includes('recoger') || text.includes('pickup') || text.includes('restaurante')) {
      session.type = 'pickup';
      session.total = session.subtotal;
      session.step = 'payment';
      return `🏪 *Recogida en restaurante*\n\nDirección: ${this.restaurantAddress}\n\n¿Método de pago?\n\n1️⃣ 💵 Efectivo (al recoger)\n2️⃣ 📱 Nequi (transferencia)\n\n_(Escribe *0* o *volver* para regresar)_`;
    }
    return `Opción no reconocida.\n\n¿Cómo deseas recibir tu pedido?\n\n1️⃣ 🛵 Domicilio (+$3.000)\n2️⃣ 🏪 Recoger en restaurante\n\n_(Escribe *0* o *volver* para regresar)_`;
  }

  private async handleAddressConfirm(text: string, session: Session): Promise<string> {
    if (text === '0' || text === 'atras' || text === 'volver') {
      session.step = 'delivery_type';
      return `¿Cómo deseas recibir tu pedido?\n\n1️⃣ 🛵 Domicilio (+$3.000)\n2️⃣ 🏪 Recoger en restaurante\n\n_(Escribe *0* o *volver* para regresar)_`;
    }
    if (text === '1') {
      session.address = session.lastAddress!;
      session.step = 'delivery_notes';
      return `📍 Dirección guardada: *${session.address}*\n\n¿Tienes alguna nota de entrega? (piso, color de casa, referencia, etc.)\n\nEscribe tu nota o *"no"* para continuar.`;
    }
    if (text === '2') {
      session.step = 'address';
      return `🛵 Escribe tu nueva dirección completa:\n\nEjemplo: "Carrera 45 #12-34, Barrio San Fernando"\n\n_(Escribe *0* o *volver* para regresar)_`;
    }
    return `Por favor responde *1* para usar la dirección anterior o *2* para escribir una nueva.`;
  }

  private handleAddress(text: string, session: Session): string {
    if (text === '0' || text === 'atras' || text === 'volver') {
      session.step = 'delivery_type';
      return `¿Cómo deseas recibir tu pedido?\n\n1️⃣ 🛵 Domicilio (+$3.000)\n2️⃣ 🏪 Recoger en restaurante\n\n_(Escribe *0* o *volver* para regresar)_`;
    }

    const hasBarrio = /\b(barrio|brio|sector|urb|urbanizacion|urbanización|conjunto|torres?|apto|apartamento|casa|bloque|edificio|lote|lt)\b/i;
    const streetAddress = /^(calle|cll|carrera|cra|cr|avenida|av|transversal|trans|tv|diagonal|diag)\b.{4,}/i;
    const manzanaAddress = /^(manzana|mz)\b.{2,}/i;
    const kmAddress = /^km\s*\d/i;
    const ruralAddress = /^(vereda|corregimiento|finca|hacienda)\b/i;
    const t = text.trim();
    const isStreet = streetAddress.test(t);
    const isManzana = manzanaAddress.test(t);
    const isKm = kmAddress.test(t);
    const isRural = ruralAddress.test(t);
    if (isStreet && !hasBarrio.test(t)) {
      return `📍 Por favor incluye el barrio o sector en tu dirección.\n\nEjemplo: "Carrera 45 #12-34, *Barrio Centro*"`;
    }
    const isValid = isStreet || isManzana || isKm || isRural || hasBarrio.test(t);
    if (!isValid) {
      return `📍 Por favor escribe una dirección válida con barrio o sector.\n\nEjemplos:\n• "Carrera 45 #12-34, Barrio Centro"\n• "Manzana 5 Casa 12, Urb. Los Almendros"\n• "Km 4 vía al Norte"\n• "Conjunto Los Pinos, Torre 2 Apto 301"`;
    }

    session.address = text;
    session.step = 'delivery_notes';
    return `📍 Dirección guardada: *${text}*\n\n¿Tienes alguna nota de entrega? (piso, color de casa, referencia, etc.)\n\nEscribe tu nota o *"no"* para continuar.`;
  }

  private handleDeliveryNotes(text: string, session: Session): string {
    if (text === '0' || text === 'atras' || text === 'volver') {
      session.step = 'address';
      return `🛵 Domicilio\n\nPor favor escribe tu dirección completa:\n\n_(Escribe *0* o *volver* para regresar)_`;
    }

    const skipWords = ['no', 'ninguna', 'nada', 'omitir', 'skip', 'continuar'];
    if (!skipWords.includes(text.toLowerCase().trim())) {
      session.deliveryNotes = text;
    }
    session.step = 'payment';
    return `📝 Nota guardada.\n\n¿Método de pago?\n\n1️⃣ 💵 Efectivo (contra entrega)\n2️⃣ 📱 Nequi (transferencia)\n\n_(Escribe *0* o *volver* para regresar)_`;
  }

  private async handlePayment(text: string, session: Session): Promise<string> {
    if (text === '0' || text === 'atras' || text === 'volver') {
      if (session.type === 'delivery') {
        session.step = 'address';
        return `🛵 Domicilio\n\nPor favor comparte tu ubicación o escribe la dirección completa:`;
      } else {
        session.step = 'delivery_type';
        return `¿Cómo deseas recibir tu pedido?\n\n1️⃣ 🛵 Domicilio (+$3.000)\n2️⃣ 🏪 Recoger en restaurante`;
      }
    }

    if (text === '1' || text.includes('efectivo') || text.includes('cash')) {
      session.paymentMethod = 'cash';
      session.step = 'confirm';
      return await this.showOrderSummary(session);
    }
    if (text === '2' || text.includes('nequi') || text.includes('transferencia')) {
      session.paymentMethod = 'nequi';
      session.step = 'confirm';
      return await this.showOrderSummary(session);
    }
    return `Opción no reconocida.\n\n¿Método de pago?\n\n1️⃣ 💵 Efectivo\n2️⃣ 📱 Nequi (transferencia)\n\n_(Escribe *0* o *volver* para regresar)_`;
  }

  private async showOrderSummary(session: Session): Promise<string> {
    let summary = `*📋 RESUMEN DE TU PEDIDO 📋*\n\n`;
    for (const [i, item] of session.items.entries()) {
      const product = await this.productRepo.findById(item.productId);
      if (!product) continue;
      const itemTotal = item.unitPrice! * item.quantity;
      summary += `${i + 1}. ${product.name}\n   ${item.quantity}x $${item.unitPrice!.toLocaleString()} = $${itemTotal.toLocaleString()}\n`;
      if ((item.customizations ?? []).length > 0) {
        summary += `   (${(item.customizations ?? []).join(', ')})\n`;
      }
      summary += `\n`;
    }
    summary += `*Subtotal:* $${session.subtotal.toLocaleString()}\n`;
    if (session.type === 'delivery') summary += `*Domicilio:* $3.000\n`;
    summary += `\n💰 *TOTAL: $${session.total.toLocaleString()}*\n\n`;
    if (session.type === 'delivery') summary += `📍 Entrega: ${session.address}\n`;
    else summary += `🏪 Recoger en: ${this.restaurantAddress}\n`;
    summary += `💳 Pago: ${session.paymentMethod === 'cash' ? 'Efectivo' : 'Nequi'}\n\n`;
    summary += `⏱️ Tiempo estimado: 25-30 minutos\n\n¿Confirmas el pedido?\n1️⃣ ✅ Sí, confirmar\n2️⃣ ❌ Cancelar\n3️⃣ ✏️ Modificar`;
    return summary;
  }

  private async handleModify(text: string, session: Session): Promise<string> {
    switch (text) {
      case '1':
        session.step = 'product';
        return `${await this.showProductList()}\n\nResponde con el número del producto que deseas agregar.`;
      case '2':
        if (session.type === 'delivery') {
          session.step = 'address';
          return `📝 *Cambiar dirección*\n\nEscribe la nueva dirección de entrega:`;
        }
        session.step = 'delivery_type';
        return `¿Cambiar método de entrega?\n\n1️⃣ 🛵 Domicilio (+$3.000)\n2️⃣ 🏪 Recoger en restaurante`;
      case '3':
        session.step = 'payment';
        return `📝 *Cambiar método de pago*\n\n1️⃣ 💵 Efectivo\n2️⃣ 📱 Nequi`;
      case '4':
      case 'cancelar':
        session.reset();
        return `❌ Pedido cancelado.\n\nEscribe "hola" para comenzar de nuevo.`;
      default:
        return `Opción no válida.\n\n1️⃣ Agregar más productos\n2️⃣ Cambiar dirección\n3️⃣ Cambiar método de pago\n4️⃣ Cancelar pedido`;
    }
  }

  private async handleConfirmation(text: string, session: Session, phone: string): Promise<string> {
    if (text === '2' || text === 'cancelar' || text === 'no') {
      session.reset();
      return `❌ Pedido cancelado. Puedes hacer un nuevo pedido cuando quieras.\n\nEscribe "hola" para comenzar de nuevo.`;
    }
    if (text === '3' || text === 'modificar') {
      session.step = 'modify';
      return `¿Qué deseas modificar?\n\n1️⃣ Agregar más productos\n2️⃣ Cambiar dirección\n3️⃣ Cambiar método de pago\n4️⃣ Cancelar pedido\n\nResponde con el número.`;
    }
    if (!(text === '1' || text === 'si' || text === 'sí' || text === 'confirmar' || text === 'ok')) {
      return `Opción no reconocida.\n\n${await this.showOrderSummary(session)}`;
    }

    const orderData = {
      customer: { name: session.customerName ?? 'Cliente', phone, chatId: session.chatId ?? undefined },
      items: session.items,
      type: session.type!,
      address: session.address ?? undefined,
      paymentMethod: session.paymentMethod!,
      notes: session.deliveryNotes ?? undefined,
    };

    try {
      const order = new Order(orderData);
      const shouldAutoConfirm = order.total < 50000 && session.items.length <= 3;
      if (shouldAutoConfirm) order.confirm();
      await this.orderRepo.save(order);
      sseService.broadcast({ type: 'orderCreated', data: order.toJSON() });
      session.reset();

      let msg = `✅ *¡PEDIDO CONFIRMADO!* ✅\n\nNúmero de orden: *#${order.id}*\n\n`;
      msg += `⏱️ Tiempo estimado: 25-30 minutos\n📞 Te contactaremos al ${phone}\n\n`;
      if (order.paymentMethod === 'nequi') {
        msg += `💳 *Pago por Nequi:*\nNúmero: 312XXXXXXX\nTotal a transferir: $${order.total.toLocaleString()}\n\nPor favor envía el comprobante por aquí.\n\n`;
      }
      msg += `Gracias por preferir Arrocería Shanti 🍚\n\nEscribe *"estado"* para consultar tu pedido.`;
      return msg;
    } catch (error) {
      return `❌ Error al procesar el pedido: ${(error as Error).message}\n\nEscribe "hola" para comenzar.`;
    }
  }

  private readonly statusEmojis: Record<string, string> = {
    pending: '⏳', confirmed: '✅', preparing: '🍳', ready: '🎉', delivered: '✅',
  };

  private readonly statusLabels: Record<string, string> = {
    pending: 'Pendiente de confirmación', confirmed: 'Confirmado',
    preparing: 'En preparación', ready: 'Listo para entrega', delivered: 'Entregado',
  };

  private async formatOrderDetail(order: Order): Promise<string> {
    const headerEmoji = order.type === 'delivery' ? '🛵' : '📦';
    let msg = `${headerEmoji} *Pedido #${order.id}*\n\n`;
    msg += `Estado: ${this.statusEmojis[order.status]} ${this.statusLabels[order.status]}\n`;
    if (order.status === 'preparing') {
      const remaining = new Date(order.estimatedReadyAt).getTime() - Date.now();
      const minutes = Math.ceil(remaining / 60000);
      if (minutes > 0) msg += `Tiempo restante: ~${minutes} minutos\n`;
    }
    msg += `\n*Productos:*\n`;
    for (const item of order.items) {
      const product = await this.productRepo.findById(item.productId);
      const name = product?.name ?? item.productId;
      msg += `• ${item.quantity}x ${name} — $${(item.unitPrice * item.quantity).toLocaleString()}\n`;
      if (item.customizations.length > 0) msg += `  _(${item.customizations.join(', ')})_\n`;
    }
    msg += `\nTotal: $${order.total.toLocaleString()}\nTipo: ${order.type === 'delivery' ? 'Domicilio' : 'Recoger en local'}`;
    return msg;
  }

  private formatOrderCompact(order: Order): string {
    const typeEmoji = order.type === 'delivery' ? '🛵' : '📦';
    return `${typeEmoji} #${order.id} — ${this.statusEmojis[order.status]} ${this.statusLabels[order.status]} — $${order.total.toLocaleString()}`;
  }

  private buildStatusPage(orders: Order[], page: number): string {
    const PAGE_SIZE = 4;
    const start = page * PAGE_SIZE;
    const slice = orders.slice(start, start + PAGE_SIZE);
    const hasNext = orders.length > start + PAGE_SIZE;
    let msg = `📋 *Pedidos activos (${start + 1}–${start + slice.length} de ${orders.length})*\n\n`;
    slice.forEach((o) => { msg += `${this.formatOrderCompact(o)}\n`; });
    msg += `\n`;
    const opts: string[] = [];
    if (hasNext) opts.push(`1️⃣ Ver más`);
    opts.push(`0️⃣ Volver al menú`);
    msg += opts.join('\n');
    return msg;
  }

  private async checkOrderStatus(phone: string, session: Session): Promise<string> {
    const orders = await this.orderRepo.findAllPendingByCustomer(phone);
    if (orders.length === 0) {
      return `No tienes pedidos activos en este momento.\n\nEscribe "hola" para hacer un nuevo pedido. 🍚`;
    }

    session.orderStatusCache = orders;
    session.orderStatusPage = 0;

    let msg = await this.formatOrderDetail(orders[0]);
    msg += `\n\nTe notificaremos cuando haya actualizaciones. 📲`;

    if (orders.length > 1) {
      msg += `\n\n─────────────────────\n`;
      msg += `*Otros pedidos activos:*\n`;
      const others = orders.slice(1, 5);
      others.forEach((o) => { msg += `${this.formatOrderCompact(o)}\n`; });
      const remaining = orders.length - 1;
      if (remaining > 4) {
        session.step = 'order_status';
        msg += `\n1️⃣ Ver más (${remaining - 4} pedido${remaining - 4 > 1 ? 's' : ''} más)\n0️⃣ Volver al menú`;
      }
    }

    return msg;
  }

  private handleOrderStatus(text: string, session: Session): string {
    if (text === '0' || text === 'atras' || text === 'volver' || text === 'menu') {
      session.step = null;
      session.orderStatusCache = null;
      session.orderStatusPage = 0;
      return this.welcomeMessage();
    }

    const orders = session.orderStatusCache ?? [];
    if (text === '1' || text === 'más' || text === 'mas' || text === 'siguiente') {
      const PAGE_SIZE = 4;
      // orders[0] shown in detail, orders[1..4] shown on initial compact list
      // each "Ver más" shows the next PAGE_SIZE starting after the first 1 + page*PAGE_SIZE
      const start = 1 + (session.orderStatusPage + 1) * PAGE_SIZE;
      session.orderStatusPage += 1;
      const slice = orders.slice(start, start + PAGE_SIZE);
      const hasNext = orders.length > start + PAGE_SIZE;
      let msg = `📋 *Más pedidos activos (${start + 1}–${start + slice.length} de ${orders.length})*\n\n`;
      slice.forEach((o) => { msg += `${this.formatOrderCompact(o)}\n`; });
      msg += `\n`;
      if (hasNext) msg += `1️⃣ Ver más\n`;
      msg += `0️⃣ Volver al menú`;
      if (!hasNext) {
        session.step = null;
        session.orderStatusCache = null;
        session.orderStatusPage = 0;
      }
      return msg;
    }

    return `Opción no reconocida.\n\n1️⃣ Ver más\n0️⃣ Volver al menú`;
  }
}
