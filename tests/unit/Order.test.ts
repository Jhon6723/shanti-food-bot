import { describe, expect, it } from 'vitest';
import { Customer, Order, OrderItem } from '../../src/domain/models/Order.js';

const baseOrderData = {
  customer: { name: 'Ana', phone: '3001234567' },
  items: [
    { productId: 'arroz-pollo', quantity: 2, unitPrice: 18000, preparationMinutes: 20, customizations: [] },
  ],
  type: 'delivery' as const,
  address: 'Calle 10 #20-30',
  paymentMethod: 'cash' as const,
};

describe('Customer', () => {
  it('normalizes phone without prefix', () => {
    const c = new Customer({ name: 'Ana', phone: '3001234567' });
    expect(c.phone).toBe('+573001234567');
  });

  it('normalizes phone with 57 prefix', () => {
    const c = new Customer({ name: 'Ana', phone: '573001234567' });
    expect(c.phone).toBe('+573001234567');
  });

  it('normalizes phone with +57 prefix', () => {
    const c = new Customer({ name: 'Ana', phone: '+573001234567' });
    expect(c.phone).toBe('+573001234567');
  });
});

describe('OrderItem', () => {
  it('calculates total correctly', () => {
    const item = new OrderItem({ productId: 'arroz-pollo', quantity: 3, unitPrice: 18000, customizations: [] });
    expect(item.total).toBe(54000);
  });

  it('defaults missing fields', () => {
    const item = new OrderItem({ productId: 'arroz-pollo', quantity: 1, customizations: [] });
    expect(item.unitPrice).toBe(0);
    expect(item.preparationMinutes).toBe(25);
    expect(item.notes).toBe('');
  });
});

describe('Order', () => {
  it('calculates subtotal from items', () => {
    const order = new Order(baseOrderData);
    expect(order.subtotal).toBe(36000);
  });

  it('adds delivery fee for delivery orders', () => {
    const order = new Order(baseOrderData);
    expect(order.deliveryFee).toBe(3000);
    expect(order.total).toBe(39000);
  });

  it('no delivery fee for pickup orders', () => {
    const order = new Order({ ...baseOrderData, type: 'pickup', address: undefined });
    expect(order.deliveryFee).toBe(0);
    expect(order.total).toBe(36000);
  });

  it('generates a unique id with SH- prefix', () => {
    const o1 = new Order(baseOrderData);
    const o2 = new Order(baseOrderData);
    expect(o1.id).toMatch(/^SH-/);
    expect(o1.id).not.toBe(o2.id);
  });

  it('starts with pending status', () => {
    const order = new Order(baseOrderData);
    expect(order.status).toBe('pending');
  });

  describe('state machine', () => {
    it('confirm() transitions pending → confirmed', () => {
      const order = new Order(baseOrderData);
      order.confirm();
      expect(order.status).toBe('confirmed');
    });

    it('confirm() throws if not pending', () => {
      const order = new Order(baseOrderData);
      order.confirm();
      expect(() => order.confirm()).toThrow('Only pending orders can be confirmed');
    });

    it('prepare() transitions confirmed → preparing', () => {
      const order = new Order(baseOrderData);
      order.confirm();
      order.prepare();
      expect(order.status).toBe('preparing');
    });

    it('prepare() throws if not confirmed', () => {
      const order = new Order(baseOrderData);
      expect(() => order.prepare()).toThrow('Order must be confirmed before preparing');
    });

    it('markReady() transitions preparing → ready', () => {
      const order = new Order(baseOrderData);
      order.confirm();
      order.prepare();
      order.markReady();
      expect(order.status).toBe('ready');
    });

    it('deliver() transitions ready → delivered', () => {
      const order = new Order(baseOrderData);
      order.confirm();
      order.prepare();
      order.markReady();
      order.deliver();
      expect(order.status).toBe('delivered');
    });

    it('cancel() works from pending', () => {
      const order = new Order(baseOrderData);
      order.cancel();
      expect(order.status).toBe('cancelled');
    });

    it('cancel() throws if already delivered', () => {
      const order = new Order(baseOrderData);
      order.confirm();
      order.prepare();
      order.markReady();
      order.deliver();
      expect(() => order.cancel()).toThrow('Cannot cancel finished order');
    });
  });

  it('toJSON returns correct shape', () => {
    const order = new Order(baseOrderData);
    const json = order.toJSON();
    expect(json).toMatchObject({
      id: expect.stringMatching(/^SH-/),
      type: 'delivery',
      paymentMethod: 'cash',
      subtotal: 36000,
      deliveryFee: 3000,
      total: 39000,
      status: 'pending',
    });
  });

  it('handles multiple items correctly', () => {
    const order = new Order({
      ...baseOrderData,
      items: [
        { productId: 'arroz-pollo', quantity: 2, unitPrice: 18000, customizations: [] },
        { productId: 'coca-400', quantity: 3, unitPrice: 4000, customizations: [] },
      ],
    });
    expect(order.subtotal).toBe(36000 + 12000);
    expect(order.total).toBe(48000 + 3000);
  });

  describe('assignedDriver (P7)', () => {
    it('starts without an assigned driver', () => {
      const order = new Order(baseOrderData);
      expect(order.assignedDriver).toBeUndefined();
    });

    it('assignDriver sets the driver id', () => {
      const order = new Order(baseOrderData);
      order.assignDriver(5);
      expect(order.assignedDriver).toBe(5);
    });

    it('assignDriver can be called multiple times to reassign', () => {
      const order = new Order(baseOrderData);
      order.assignDriver(5);
      order.assignDriver(3);
      expect(order.assignedDriver).toBe(3);
    });

    it('assignDriver throws if order is already delivered', () => {
      const order = new Order(baseOrderData);
      order.confirm();
      order.prepare();
      order.markReady();
      order.deliver(1);
      expect(() => order.assignDriver(2)).toThrow('Cannot assign driver to a delivered or cancelled order');
    });

    it('assignDriver throws if order is cancelled', () => {
      const order = new Order(baseOrderData);
      order.cancel();
      expect(() => order.assignDriver(2)).toThrow('Cannot assign driver to a delivered or cancelled order');
    });

    it('toJSON includes assignedDriver', () => {
      const order = new Order(baseOrderData);
      order.assignDriver(5);
      const json = order.toJSON();
      expect(json.assignedDriver).toBe(5);
    });

    it('toJSON includes assignedDriver as undefined when not set', () => {
      const order = new Order(baseOrderData);
      const json = order.toJSON();
      expect(json.assignedDriver).toBeUndefined();
    });

    it('accepts assignedDriver in constructor data', () => {
      const order = new Order({ ...baseOrderData, assignedDriver: 7 });
      expect(order.assignedDriver).toBe(7);
    });
  });
});
