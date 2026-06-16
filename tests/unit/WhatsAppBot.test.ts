import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppBot } from '../../src/bot/WhatsAppBot.js';
import { Order } from '../../src/domain/models/Order.js';
import type { OrderRepository } from '../../src/infrastructure/repositories/OrderRepository.js';

// Minimal mock repository — no DB involved
function makeRepo(overrides: Partial<OrderRepository> = {}): OrderRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(undefined),
    findAll: vi.fn().mockResolvedValue([]),
    findByCustomerPhone: vi.fn().mockResolvedValue([]),
    findPendingByCustomer: vi.fn().mockResolvedValue(undefined),
    getCustomerNameByPhone: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(false),
    getStats: vi.fn().mockResolvedValue({}),
    findLastDeliveryAddress: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as OrderRepository;
}

function msg(body: string) {
  return { type: 'text' as const, text: { body } };
}

const PHONE = '3001234567';

describe('WhatsAppBot — welcome flow', () => {
  let bot: WhatsAppBot;
  let repo: OrderRepository;

  beforeEach(() => {
    repo = makeRepo();
    bot = new WhatsAppBot(repo);
  });

  it('responds with welcome message on "hola"', async () => {
    const res = await bot.handleMessage(PHONE, msg('hola'));
    expect(res).toContain('Bienvenido a Arrocería Shanti');
    expect(res).toContain('1️⃣');
  });

  it('greets returning customer by name', async () => {
    repo = makeRepo({ getCustomerNameByPhone: vi.fn().mockResolvedValue('María') });
    bot = new WhatsAppBot(repo);
    const res = await bot.handleMessage(PHONE, msg('hola'));
    expect(res).toContain('María');
    expect(res).toContain('Hola de nuevo');
  });

  it('responds with welcome on unknown input when no session', async () => {
    const res = await bot.handleMessage(PHONE, msg('xkcd'));
    expect(res).toContain('Bienvenido');
  });

  it('option 4 offers to connect with staff', async () => {
    await bot.handleMessage(PHONE, msg('hola'));
    const res = await bot.handleMessage(PHONE, msg('4'));
    expect(res).toContain('conectando');
  });
});

describe('WhatsAppBot — order flow (happy path)', () => {
  let bot: WhatsAppBot;

  beforeEach(() => {
    bot = new WhatsAppBot(makeRepo());
  });

  async function startOrder() {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));          // Hacer pedido
    await bot.handleMessage(PHONE, msg('Carlos'));     // nombre
  }

  it('asks for name when starting order', async () => {
    await bot.handleMessage(PHONE, msg('hola'));
    const res = await bot.handleMessage(PHONE, msg('2'));
    expect(res).toContain('nombre');
  });

  it('shows product list after entering name', async () => {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    const res = await bot.handleMessage(PHONE, msg('Carlos'));
    expect(res).toContain('MENÚ');
    expect(res).toContain('Arroz Chino de Pollo');
  });

  it('shows customization options after selecting product', async () => {
    await startOrder();
    const res = await bot.handleMessage(PHONE, msg('1')); // Arroz Chino de Pollo
    expect(res).toContain('personalización');
    expect(res).toContain('sin cebolla');
  });

  it('asks for quantity after customization', async () => {
    await startOrder();
    await bot.handleMessage(PHONE, msg('1'));  // product
    const res = await bot.handleMessage(PHONE, msg('4')); // Ninguna
    expect(res).toContain('porciones');
  });

  it('adds item and shows subtotal', async () => {
    await startOrder();
    await bot.handleMessage(PHONE, msg('1'));  // product
    await bot.handleMessage(PHONE, msg('4'));  // Ninguna
    const res = await bot.handleMessage(PHONE, msg('2')); // 2 porciones
    expect(res).toContain('Agregado');
    expect(res).toMatch(/36[.,]000/);
  });

  it('shows delivery type after finalizing product selection', async () => {
    await startOrder();
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('4'));
    await bot.handleMessage(PHONE, msg('1'));  // 1 porción
    const res = await bot.handleMessage(PHONE, msg('2')); // No, finalizar
    expect(res).toContain('Domicilio');
  });

  it('asks for address on delivery selection', async () => {
    await startOrder();
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('4'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('2'));
    const res = await bot.handleMessage(PHONE, msg('1')); // Domicilio
    expect(res).toContain('dirección');
  });

  it('asks for delivery notes after address', async () => {
    await startOrder();
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('4'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('1'));
    const res = await bot.handleMessage(PHONE, msg('Carrera 10 #20-30, Barrio Centro'));
    expect(res).toContain('nota');
  });

  it('asks for payment method after delivery notes', async () => {
    await startOrder();
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('4'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('Carrera 10 #20-30, Barrio Centro'));
    const res = await bot.handleMessage(PHONE, msg('no'));
    expect(res).toContain('pago');
    expect(res).toContain('Efectivo');
  });

  it('shows order summary before confirmation', async () => {
    await startOrder();
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('4'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('Carrera 10 #20-30, Barrio Centro'));
    await bot.handleMessage(PHONE, msg('no')); // skip notas
    const res = await bot.handleMessage(PHONE, msg('1')); // Efectivo
    expect(res).toContain('RESUMEN');
    expect(res).toContain('Arroz Chino de Pollo');
    expect(res).toContain('TOTAL');
  });

  it('confirms order and saves to repo', async () => {
    const repo = makeRepo();
    bot = new WhatsAppBot(repo);
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('Carlos'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('4'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('Carrera 10 #20-30, Barrio Centro'));
    await bot.handleMessage(PHONE, msg('no')); // skip notas
    await bot.handleMessage(PHONE, msg('1'));
    const res = await bot.handleMessage(PHONE, msg('1')); // Confirmar
    expect(res).toContain('PEDIDO CONFIRMADO');
    expect(res).toContain('SH-');
    expect(repo.save).toHaveBeenCalledOnce();
  });

  it('includes Nequi payment instructions when paying by Nequi', async () => {
    await startOrder();
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('4'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('Carrera 10 #20-30, Barrio Centro'));
    await bot.handleMessage(PHONE, msg('no')); // skip notas
    await bot.handleMessage(PHONE, msg('2')); // Nequi
    const res = await bot.handleMessage(PHONE, msg('1')); // Confirmar
    expect(res).toContain('Nequi');
    expect(res).toContain('312XXXXXXX');
  });
});

describe('WhatsAppBot — order flow (sad paths)', () => {
  let bot: WhatsAppBot;

  beforeEach(() => {
    bot = new WhatsAppBot(makeRepo());
  });

  it('does not crash when ordering a product without customization options (regression)', async () => {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('Carlos'));
    await bot.handleMessage(PHONE, msg('7')); // Coca-Cola 400ml — no customizations
    const res = await bot.handleMessage(PHONE, msg('1')); // quantity
    expect(res).toContain('Agregado');
    expect(res).toContain('Coca-Cola');
  });

  it('rejects name shorter than 2 chars', async () => {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    const res = await bot.handleMessage(PHONE, msg('A'));
    expect(res).toContain('nombre real');
  });

  it('rejects invalid product number', async () => {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('Carlos'));
    const res = await bot.handleMessage(PHONE, msg('99'));
    expect(res).toContain('No encontré');
  });

  it('rejects invalid customization number', async () => {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('Carlos'));
    await bot.handleMessage(PHONE, msg('1')); // product
    const res = await bot.handleMessage(PHONE, msg('22'));
    expect(res).toContain('No reconocí');
  });

  it('rejects quantity > 20', async () => {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('Carlos'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('4')); // Ninguna
    const res = await bot.handleMessage(PHONE, msg('99'));
    expect(res).toContain('máxima');
    expect(res).toContain('20');
  });

  async function goToAddressStep(b: WhatsAppBot) {
    await b.handleMessage(PHONE, msg('hola'));
    await b.handleMessage(PHONE, msg('2'));
    await b.handleMessage(PHONE, msg('Carlos'));
    await b.handleMessage(PHONE, msg('1'));  // producto
    await b.handleMessage(PHONE, msg('4'));  // Ninguna
    await b.handleMessage(PHONE, msg('1'));  // cantidad
    await b.handleMessage(PHONE, msg('2'));  // finalizar
    await b.handleMessage(PHONE, msg('1'));  // Domicilio → address step
  }

  it('rejects single punctuation as address', async () => {
    await goToAddressStep(bot);
    const res = await bot.handleMessage(PHONE, msg('.'));
    expect(res).toContain('dirección válida');
  });

  it('rejects generic short text as address', async () => {
    await goToAddressStep(bot);
    const res = await bot.handleMessage(PHONE, msg('que tal como está?'));
    expect(res).toContain('dirección válida');
  });

  it('rejects street address without barrio/sector', async () => {
    await goToAddressStep(bot);
    const res = await bot.handleMessage(PHONE, msg('Calle 45 #12-34'));
    expect(res).toContain('barrio');
  });

  it('accepts street address with barrio', async () => {
    await goToAddressStep(bot);
    const res = await bot.handleMessage(PHONE, msg('Calle 45 #12-34, Barrio Centro'));
    expect(res).toContain('nota');
  });

  it('accepts valid colombian address: Calle format', async () => {
    await goToAddressStep(bot);
    const res = await bot.handleMessage(PHONE, msg('Calle 45 #12-34, Barrio El Prado'));
    expect(res).toContain('nota');
  });

  it('accepts valid colombian address: Carrera format', async () => {
    await goToAddressStep(bot);
    const res = await bot.handleMessage(PHONE, msg('Carrera 7 # 45-67, Barrio Centro'));
    expect(res).toContain('nota');
  });

  it('accepts valid colombian address: Cra abbreviation', async () => {
    await goToAddressStep(bot);
    const res = await bot.handleMessage(PHONE, msg('Cra 15 No. 80-23, Barrio La Floresta'));
    expect(res).toContain('nota');
  });

  it('accepts valid colombian address: Avenida format', async () => {
    await goToAddressStep(bot);
    const res = await bot.handleMessage(PHONE, msg('Av. El Dorado 123-45, Barrio Modelia'));
    expect(res).toContain('nota');
  });

  it('accepts descriptive address with apartment/conjunto', async () => {
    await goToAddressStep(bot);
    const res = await bot.handleMessage(PHONE, msg('Conjunto Residencial Los Pinos, Torre 3 Apto 204'));
    expect(res).toContain('nota');
  });

  it('accepts manzana/casa format', async () => {
    await goToAddressStep(bot);
    const res = await bot.handleMessage(PHONE, msg('Manzana 5 Casa 12, Urb. Los Almendros'));
    expect(res).toContain('nota');
  });

  it('accepts Mz abbreviation', async () => {
    await goToAddressStep(bot);
    const res = await bot.handleMessage(PHONE, msg('Mz 3 Lt 8, Barrio El Remanso'));
    expect(res).toContain('nota');
  });

  it('accepts km/via format', async () => {
    await goToAddressStep(bot);
    const res = await bot.handleMessage(PHONE, msg('Km 4 vía al Norte, finca La Esperanza'));
    expect(res).toContain('nota');
  });

  it('accepts vereda/rural format', async () => {
    await goToAddressStep(bot);
    const res = await bot.handleMessage(PHONE, msg('Vereda El Palmar, casa blanca cerca al colegio'));
    expect(res).toContain('nota');
  });

  it('asks for delivery notes after valid address', async () => {
    await goToAddressStep(bot);
    const res = await bot.handleMessage(PHONE, msg('Calle 45 #12-34, Barrio Centro'));
    expect(res).toContain('nota');
  });

  it('proceeds to payment after delivery notes', async () => {
    await goToAddressStep(bot);
    await bot.handleMessage(PHONE, msg('Calle 45 #12-34, Barrio Centro'));
    const res = await bot.handleMessage(PHONE, msg('Casa azul, timbre no funciona'));
    expect(res).toContain('Método de pago');
  });

  it('proceeds to payment when user skips delivery notes', async () => {
    await goToAddressStep(bot);
    await bot.handleMessage(PHONE, msg('Calle 45 #12-34, Barrio Centro'));
    const res = await bot.handleMessage(PHONE, msg('no'));
    expect(res).toContain('Método de pago');
  });

  it('cancel cancels the order', async () => {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('Carlos'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('4'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('Carrera 10 #20-30, Barrio Centro'));
    await bot.handleMessage(PHONE, msg('no')); // skip notas
    await bot.handleMessage(PHONE, msg('1'));
    const res = await bot.handleMessage(PHONE, msg('2')); // Cancelar
    expect(res).toContain('cancelado');
  });
});

describe('WhatsAppBot — navigation (0/volver/atrás)', () => {
  let bot: WhatsAppBot;

  beforeEach(() => {
    bot = new WhatsAppBot(makeRepo());
  });

  it('0 in customization step goes back to product list', async () => {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('Carlos'));
    await bot.handleMessage(PHONE, msg('1')); // select product
    const res = await bot.handleMessage(PHONE, msg('0'));
    expect(res).toContain('MENÚ');
  });

  it('0 in quantity step goes back to customization', async () => {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('Carlos'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('4')); // Ninguna → quantity
    const res = await bot.handleMessage(PHONE, msg('0'));
    expect(res).toContain('personalización');
  });

  it('0 in quantity step shows current cart items', async () => {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('Carlos'));
    // add first item
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('4')); // Ninguna
    await bot.handleMessage(PHONE, msg('2')); // 2 porciones → add_more
    // start second item
    await bot.handleMessage(PHONE, msg('1')); // ver menú
    await bot.handleMessage(PHONE, msg('2')); // Arroz de Cerdo
    await bot.handleMessage(PHONE, msg('4')); // Ninguna → quantity
    const res = await bot.handleMessage(PHONE, msg('0')); // back
    expect(res).toContain('Arroz Chino de Pollo'); // first item visible in cart
  });

  it('0 in add_more removes last item', async () => {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('Carlos'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('4'));
    await bot.handleMessage(PHONE, msg('1')); // added item
    const res = await bot.handleMessage(PHONE, msg('0'));
    expect(res).toContain('eliminado del carrito');
  });

  it('"volver" in delivery_type goes back to add_more', async () => {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('Carlos'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('4'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('2')); // finalizar → delivery_type
    const res = await bot.handleMessage(PHONE, msg('volver'));
    expect(res).toContain('agregar algo más');
  });
});

describe('WhatsAppBot — quantity label by category', () => {
  let bot: WhatsAppBot;

  beforeEach(() => {
    bot = new WhatsAppBot(makeRepo());
  });

  it('uses "porciones" for food products (arroz_chino)', async () => {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('Carlos'));
    await bot.handleMessage(PHONE, msg('1')); // Arroz Chino de Pollo
    const res = await bot.handleMessage(PHONE, msg('4')); // Ninguna → quantity prompt
    expect(res).toContain('porciones');
    expect(res).not.toContain('unidades');
  });

  it('uses "unidades" for drinks (bebidas)', async () => {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('Carlos'));
    const res = await bot.handleMessage(PHONE, msg('7')); // Coca-Cola 400ml
    expect(res).toContain('unidades');
    expect(res).not.toContain('porciones');
  });

  it('uses "porciones" for bandeja_paisa', async () => {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('Carlos'));
    await bot.handleMessage(PHONE, msg('5')); // Bandeja Paisa (2 opts → Ninguna = 3)
    const res = await bot.handleMessage(PHONE, msg('3')); // Ninguna → quantity prompt
    expect(res).toContain('porciones');
  });
});

describe('WhatsAppBot — order status', () => {
  it('returns no active orders message when none found', async () => {
    const bot = new WhatsAppBot(makeRepo());
    await bot.handleMessage(PHONE, msg('hola'));
    const res = await bot.handleMessage(PHONE, msg('3'));
    expect(res).toContain('No tienes pedidos activos');
  });

  it('shows pending order details with items', async () => {
    const pendingOrder = new Order({
      id: 'SH-TEST001',
      customer: { name: 'Carlos', phone: PHONE },
      items: [{ productId: 'arroz-pollo', quantity: 2, unitPrice: 18000, customizations: [] }],
      type: 'delivery',
      address: 'Calle 10',
      paymentMethod: 'cash',
    });

    const bot = new WhatsAppBot(makeRepo({
      findPendingByCustomer: vi.fn().mockResolvedValue(pendingOrder),
    }));

    await bot.handleMessage(PHONE, msg('hola'));
    const res = await bot.handleMessage(PHONE, msg('3'));
    expect(res).toContain('Pedido #SH-TEST001');
    expect(res).toContain('Arroz Chino de Pollo');
    expect(res).toContain('2x');
    expect(res).toContain('🛵'); // delivery emoji
  });

  it('shows pickup emoji for pickup orders', async () => {
    const pickupOrder = new Order({
      customer: { name: 'Carlos', phone: PHONE },
      items: [{ productId: 'coca-400', quantity: 1, unitPrice: 4000, customizations: [] }],
      type: 'pickup',
      paymentMethod: 'cash',
    });

    const bot = new WhatsAppBot(makeRepo({
      findPendingByCustomer: vi.fn().mockResolvedValue(pickupOrder),
    }));

    await bot.handleMessage(PHONE, msg('hola'));
    const res = await bot.handleMessage(PHONE, msg('3'));
    expect(res).toContain('📦');
  });

  it('"estado" keyword checks order from anywhere in conversation', async () => {
    const bot = new WhatsAppBot(makeRepo());
    const res = await bot.handleMessage(PHONE, msg('estado'));
    expect(res).toContain('No tienes pedidos activos');
  });
});

describe('WhatsAppBot — modify flow', () => {
  let bot: WhatsAppBot;

  beforeEach(() => {
    bot = new WhatsAppBot(makeRepo());
  });

  async function reachConfirmation() {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('Carlos'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('4'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('1'));
    await bot.handleMessage(PHONE, msg('Carrera 10 #20-30, Barrio Centro'));
    await bot.handleMessage(PHONE, msg('no')); // skip notas
    await bot.handleMessage(PHONE, msg('1'));
  }

  it('option 3 in confirmation enters modify menu', async () => {
    await reachConfirmation();
    const res = await bot.handleMessage(PHONE, msg('3'));
    expect(res).toContain('modificar');
    expect(res).toContain('Agregar más productos');
  });

  it('modify option 2 allows changing address', async () => {
    await reachConfirmation();
    await bot.handleMessage(PHONE, msg('3')); // Modificar
    const res = await bot.handleMessage(PHONE, msg('2')); // Cambiar dirección
    expect(res).toContain('dirección');
  });

  it('modify option 3 allows changing payment method', async () => {
    await reachConfirmation();
    await bot.handleMessage(PHONE, msg('3'));
    const res = await bot.handleMessage(PHONE, msg('3'));
    expect(res).toContain('pago');
    expect(res).toContain('Efectivo');
  });

  it('modify option 4 cancels the order', async () => {
    await reachConfirmation();
    await bot.handleMessage(PHONE, msg('3'));
    const res = await bot.handleMessage(PHONE, msg('4'));
    expect(res).toContain('cancelado');
  });

  it('after modify→add product→finalizar goes back to confirm (not delivery_type)', async () => {
    await reachConfirmation();
    await bot.handleMessage(PHONE, msg('3')); // Modificar
    await bot.handleMessage(PHONE, msg('1')); // Agregar más productos
    await bot.handleMessage(PHONE, msg('7')); // Coca-Cola 400ml
    await bot.handleMessage(PHONE, msg('1')); // 1 unidad
    const res = await bot.handleMessage(PHONE, msg('2')); // finalizar
    expect(res).toContain('RESUMEN');
    expect(res).not.toContain('¿Cómo deseas recibir tu pedido?');
  });
});

describe('WhatsAppBot — last address reuse', () => {
  async function goToDeliveryType(bot: WhatsAppBot) {
    await bot.handleMessage(PHONE, msg('hola'));
    await bot.handleMessage(PHONE, msg('2'));
    await bot.handleMessage(PHONE, msg('Carlos'));
    await bot.handleMessage(PHONE, msg('1'));  // producto
    await bot.handleMessage(PHONE, msg('4'));  // Ninguna
    await bot.handleMessage(PHONE, msg('1'));  // cantidad
    await bot.handleMessage(PHONE, msg('2'));  // finalizar
    return bot.handleMessage(PHONE, msg('1')); // Domicilio
  }

  it('offers last address when customer has a previous delivery order', async () => {
    const repo = makeRepo({
      findLastDeliveryAddress: vi.fn().mockResolvedValue('Carrera 45 #12-34'),
    });
    const bot = new WhatsAppBot(repo);
    const res = await goToDeliveryType(bot);
    expect(res).toContain('Carrera 45 #12-34');
    expect(res).toContain('1');
    expect(res).toContain('2');
  });

  it('goes straight to address input when no previous address exists', async () => {
    const repo = makeRepo({
      findLastDeliveryAddress: vi.fn().mockResolvedValue(null),
    });
    const bot = new WhatsAppBot(repo);
    const res = await goToDeliveryType(bot);
    expect(res).toContain('dirección');
    expect(res).not.toContain('anterior');
  });

  it('reuses last address when user picks option 1', async () => {
    const repo = makeRepo({
      findLastDeliveryAddress: vi.fn().mockResolvedValue('Carrera 45 #12-34'),
    });
    const bot = new WhatsAppBot(repo);
    await goToDeliveryType(bot);
    const res = await bot.handleMessage(PHONE, msg('1')); // usar dirección anterior
    expect(res).toContain('nota');
  });

  it('goes to address input when user picks option 2 (enter new address)', async () => {
    const repo = makeRepo({
      findLastDeliveryAddress: vi.fn().mockResolvedValue('Carrera 45 #12-34'),
    });
    const bot = new WhatsAppBot(repo);
    await goToDeliveryType(bot);
    const res = await bot.handleMessage(PHONE, msg('2')); // escribir nueva
    expect(res).toContain('dirección');
    expect(res).not.toContain('anterior');
  });
});
