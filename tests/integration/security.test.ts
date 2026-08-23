// Security tests: error sanitization (#4) and rate limiting (#5)
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

const TEST_JWT_SECRET = 'test-secret-for-security-tests';
process.env.JWT_SECRET = TEST_JWT_SECRET;

function makeToken(role: 'admin' | 'delivery' = 'admin') {
  return jwt.sign({ userId: 1, role }, TEST_JWT_SECRET, { expiresIn: '1h' });
}

// Mock OrderRepository — make findAll throw to trigger error handler
vi.mock('../../src/infrastructure/repositories/OrderRepository.js', () => {
  const mockRepo = {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(undefined),
    findAll: vi.fn().mockResolvedValue([]),
    findByCustomerPhone: vi.fn().mockResolvedValue([]),
    findPendingByCustomer: vi.fn().mockResolvedValue(undefined),
    getCustomerNameByPhone: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(false),
    getStats: vi.fn().mockResolvedValue({
      total: 0, pending: 0, confirmed: 0, preparing: 0,
      ready: 0, delivered: 0, cancelled: 0, todayRevenue: 0,
    }),
    getSalesReport: vi.fn().mockResolvedValue({
      summary: {
        totalOrders: 0, totalRevenue: 0, totalDeliveryFees: 0,
        averageOrderValue: 0, cancelledOrders: 0,
        byPaymentMethod: [], byOrderType: [], byDay: [],
      },
      orders: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    }),
  };
  return { orderRepository: mockRepo, OrderRepository: vi.fn(() => mockRepo) };
});

vi.mock('../../src/infrastructure/database/connection.js', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  query: vi.fn().mockResolvedValue([]),
  queryOne: vi.fn().mockResolvedValue(undefined),
  initDatabase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/infrastructure/whatsapp/WhatsAppSender.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/infrastructure/repositories/ProductRepository.js', () => {
  const mockRepo = {
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(undefined),
    findByCategory: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return { productRepository: mockRepo, ProductRepository: vi.fn(() => mockRepo) };
});

vi.mock('../../src/infrastructure/repositories/CategoryRepository.js', () => {
  const mockRepo = {
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    hasProducts: vi.fn().mockResolvedValue(false),
  };
  return { categoryRepository: mockRepo, CategoryRepository: vi.fn(() => mockRepo) };
});

// ─── #4: Error sanitization ─────────────────────────────────────────────────

describe('Security #4 — Error sanitization in production', () => {
  let originalEnv: string | undefined;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    app = createApp();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it('returns generic error message in production', async () => {
    process.env.NODE_ENV = 'production';
    const { orderRepository } = await import('../../src/infrastructure/repositories/OrderRepository.js');
    (orderRepository.findAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('syntax error at or near "FROM" — SELECT * FROM orders WHERE'));

    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${makeToken('admin')}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
    expect(res.body.error).not.toContain('syntax error');
    expect(res.body.error).not.toContain('SELECT');
  });

  it('returns detailed error message in development', async () => {
    process.env.NODE_ENV = 'development';
    const { orderRepository } = await import('../../src/infrastructure/repositories/OrderRepository.js');
    const detailMsg = 'syntax error at or near "FROM"';
    (orderRepository.findAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error(detailMsg));

    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${makeToken('admin')}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe(detailMsg);
  });
});

// ─── #5: Rate limiting ──────────────────────────────────────────────────────

describe('Security #5 — Rate limiting', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  it('returns 429 after exceeding webhook rate limit (30/min)', async () => {
    // Send 30 requests (the limit) — these should succeed
    for (let i = 0; i < 30; i++) {
      const res = await request(app)
        .post('/api/v1/webhooks/whatsapp')
        .send({ test: true });
      expect(res.status).toBe(200);
    }

    // 31st request should be rate limited
    const res = await request(app)
      .post('/api/v1/webhooks/whatsapp')
      .send({ test: true });
    expect(res.status).toBe(429);
    expect(res.body.error).toContain('Too many');
  });

  it('returns 429 after exceeding auth rate limit (10/15min)', async () => {
    // Send 10 login attempts (the limit)
    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'test', password: 'wrong' });
    }

    // 11th should be rate limited
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'test', password: 'wrong' });
    expect(res.status).toBe(429);
    expect(res.body.error).toContain('Too many');
  });
});
