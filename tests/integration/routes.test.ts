import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

const TEST_JWT_SECRET = 'test-secret-for-tests';
process.env.JWT_SECRET = TEST_JWT_SECRET;

function makeToken(role: 'admin' | 'delivery' = 'admin') {
  return jwt.sign({ userId: 1, role }, TEST_JWT_SECRET, { expiresIn: '1h' });
}

// Mock the OrderRepository singleton before importing routes
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
  };
  return { orderRepository: mockRepo, OrderRepository: vi.fn(() => mockRepo) };
});

// Mock pool to avoid real DB calls in auth/users routes
vi.mock('../../src/infrastructure/database/connection.js', () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  query: vi.fn().mockResolvedValue([]),
  queryOne: vi.fn().mockResolvedValue(undefined),
  initDatabase: vi.fn().mockResolvedValue(undefined),
}));

// Mock WhatsApp sender to avoid real HTTP calls
vi.mock('../../src/infrastructure/whatsapp/WhatsAppSender.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
}));

const app = createApp();

// ─── Products ────────────────────────────────────────────────────────────────

describe('GET /api/v1/products', () => {
  it('returns 200 with product list', async () => {
    const res = await request(app).get('/api/v1/products');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('filters by category', async () => {
    const res = await request(app).get('/api/v1/products?category=bebidas');
    expect(res.status).toBe(200);
    for (const p of res.body) {
      expect(p.category).toBe('bebidas');
    }
  });

  it('filters available=true', async () => {
    const res = await request(app).get('/api/v1/products?available=true');
    expect(res.status).toBe(200);
    for (const p of res.body) {
      expect(p.available).toBe(true);
    }
  });
});

describe('GET /api/v1/products/:id', () => {
  it('returns product by id', async () => {
    const res = await request(app).get('/api/v1/products/arroz-pollo');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('arroz-pollo');
    expect(res.body.name).toBe('Arroz Chino de Pollo');
  });

  it('returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/v1/products/no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('GET /api/v1/products/menu/whatsapp', () => {
  it('returns structured menu', async () => {
    const res = await request(app).get('/api/v1/products/menu/whatsapp');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('arroces_chinos');
    expect(res.body).toHaveProperty('bandejas');
    expect(res.body).toHaveProperty('bebidas');
  });
});

// ─── Orders ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/orders', () => {
  const validBody = {
    customer: { name: 'Ana', phone: '3001234567' },
    items: [{ productId: 'arroz-pollo', quantity: 1 }],
    type: 'pickup',
    paymentMethod: 'cash',
  };

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/v1/orders').send(validBody);
    expect(res.status).toBe(401);
  });

  it('creates order and returns 201', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.id).toMatch(/^SH-/);
  });

  it('returns 400 when customer missing', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, customer: undefined });
    expect(res.status).toBe(400);
  });

  it('returns 400 when items empty', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, items: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid type', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, type: 'teleport' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for delivery without address', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, type: 'delivery' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Address');
  });

  it('returns 400 for invalid paymentMethod', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, paymentMethod: 'bitcoin' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown product', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, items: [{ productId: 'no-existe', quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('not found');
  });

  it('auto-confirms small orders (total < 50000, ≤3 items)', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ ...validBody, items: [{ productId: 'coca-400', quantity: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('confirmed');
  });
});

describe('GET /api/v1/orders', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/orders');
    expect(res.status).toBe(401);
  });

  it('returns 200 with empty list when no orders', async () => {
    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/v1/orders/:id', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/orders/SH-UNKNOWN');
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown order', async () => {
    const res = await request(app)
      .get('/api/v1/orders/SH-UNKNOWN')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(404);
  });
});

// ─── Health ──────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('404 handler', () => {
  it('returns 404 for unknown endpoints', async () => {
    const res = await request(app).get('/api/v1/unknown');
    expect(res.status).toBe(404);
  });
});

// ─── Webhook ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/webhooks/whatsapp — verification', () => {
  const token = 'test-token';

  beforeEach(() => {
    process.env.WHATSAPP_VERIFY_TOKEN = token;
  });

  it('returns challenge on valid verification', async () => {
    const res = await request(app).get(
      `/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=abc123`
    );
    expect(res.status).toBe(200);
    expect(res.text).toBe('abc123');
  });

  it('returns 403 on wrong token', async () => {
    const res = await request(app).get(
      '/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123'
    );
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/webhooks/whatsapp', () => {
  it('returns 200 on valid Meta payload', async () => {
    const payload = {
      entry: [{
        changes: [{
          value: {
            messages: [{
              id: 'msg-001',
              from: '573001234567',
              type: 'text',
              text: { body: 'hola' },
            }],
          },
        }],
      }],
    };
    const res = await request(app)
      .post('/api/v1/webhooks/whatsapp')
      .send(payload);
    expect(res.status).toBe(200);
  });

  it('returns 200 on empty payload (no messages)', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/whatsapp')
      .send({ entry: [] });
    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/webhooks/test', () => {
  it('returns bot response for given phone and message', async () => {
    const res = await request(app).get(
      '/api/v1/webhooks/test?phone=3001234567&message=hola'
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('response');
    expect(res.body.response).toContain('Bienvenido');
  });

  it('returns 400 when params missing', async () => {
    const res = await request(app).get('/api/v1/webhooks/test?phone=3001234567');
    expect(res.status).toBe(400);
  });
});
