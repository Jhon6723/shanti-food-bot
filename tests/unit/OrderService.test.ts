import { describe, expect, it, vi } from 'vitest';
import { OrderService } from '../../src/application/OrderService.js';
import type { OrderRepositoryPort } from '../../src/application/ports/OrderRepositoryPort.js';
import { Order } from '../../src/domain/models/Order.js';

function makeRepo(overrides: Partial<OrderRepositoryPort> = {}): OrderRepositoryPort {
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
    findAllPendingByCustomer: vi.fn().mockResolvedValue([]),
    getSalesReport: vi.fn().mockResolvedValue({ summary: {}, orders: [], pagination: {} }),
    ...overrides,
  } as unknown as OrderRepositoryPort;
}

function makeOrder(id = 'SH-001', status = 'pending' as const) {
  return new Order({
    id,
    customer: { name: 'Ana', phone: '3001234567' },
    items: [{ productId: 'arroz-pollo', quantity: 1, unitPrice: 18000, customizations: [] }],
    type: 'delivery',
    address: 'Calle 10 #20-30',
    paymentMethod: 'cash',
    status,
  });
}

describe('OrderService', () => {
  it('creates an order via the repository', async () => {
    const repo = makeRepo();
    const service = new OrderService(repo);
    const order = makeOrder();

    await service.createOrder(order);

    expect(repo.save).toHaveBeenCalledWith(order);
  });

  it('returns all orders via the repository', async () => {
    const repo = makeRepo({ findAll: vi.fn().mockResolvedValue([makeOrder()]) });
    const service = new OrderService(repo);

    const orders = await service.getOrders({});

    expect(repo.findAll).toHaveBeenCalledWith({});
    expect(orders).toHaveLength(1);
  });

  it('returns a single order by id', async () => {
    const order = makeOrder('SH-002');
    const repo = makeRepo({ findById: vi.fn().mockResolvedValue(order) });
    const service = new OrderService(repo);

    const result = await service.getOrderById('SH-002');

    expect(repo.findById).toHaveBeenCalledWith('SH-002');
    expect(result?.id).toBe('SH-002');
  });

  it('updates an order via the repository', async () => {
    const repo = makeRepo();
    const service = new OrderService(repo);
    const order = makeOrder();

    await service.updateOrder(order);

    expect(repo.update).toHaveBeenCalledWith(order);
  });

  it('returns dashboard stats', async () => {
    const stats = { total: 42, pending: 5, confirmed: 10 };
    const repo = makeRepo({ getStats: vi.fn().mockResolvedValue(stats) });
    const service = new OrderService(repo);

    const result = await service.getDashboardStats();

    expect(repo.getStats).toHaveBeenCalled();
    expect(result).toEqual(stats);
  });

  it('returns sales report', async () => {
    const report = {
      summary: { totalOrders: 100 },
      orders: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    };
    const repo = makeRepo({ getSalesReport: vi.fn().mockResolvedValue(report) });
    const service = new OrderService(repo);

    const result = await service.getSalesReport({ from: '2024-01-01', to: '2024-01-31' });

    expect(repo.getSalesReport).toHaveBeenCalledWith(expect.objectContaining({ from: '2024-01-01', to: '2024-01-31' }));
    expect(result).toEqual(report);
  });
});
