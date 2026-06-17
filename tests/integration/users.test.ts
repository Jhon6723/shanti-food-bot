// Integration tests: /api/v1/users (admin only)

import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

const TEST_JWT_SECRET = 'test-secret-for-tests';
process.env.JWT_SECRET = TEST_JWT_SECRET;

const { mockPool } = vi.hoisted(() => ({ mockPool: { query: vi.fn() } }));

vi.mock('../../src/infrastructure/database/connection.js', () => ({
  pool: mockPool,
  query: vi.fn().mockResolvedValue([]),
  queryOne: vi.fn().mockResolvedValue(undefined),
  initDatabase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/infrastructure/repositories/OrderRepository.js', () => ({
  orderRepository: {},
  OrderRepository: vi.fn(),
}));

vi.mock('../../src/infrastructure/whatsapp/WhatsAppSender.js', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
}));

const app = createApp();

function makeToken(role: 'admin' | 'delivery' = 'admin') {
  return jwt.sign({ userId: 1, role }, TEST_JWT_SECRET, { expiresIn: '1h' });
}

const adminToken = makeToken('admin');
const deliveryToken = makeToken('delivery');

const mockUser = {
  id: 2, name: 'Juan Pérez', username: 'juan.perez',
  role: 'delivery', active: true, created_at: new Date().toISOString(),
};

// ─── GET /users ───────────────────────────────────────────────────────────────

describe('GET /api/v1/users', () => {
  beforeEach(() => {
    mockPool.query.mockResolvedValue({ rows: [mockUser] });
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(401);
  });

  it('returns 403 for delivery role', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${deliveryToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 with user list for admin', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('filters by role=delivery', async () => {
    const res = await request(app)
      .get('/api/v1/users?role=delivery')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

// ─── POST /users ──────────────────────────────────────────────────────────────

describe('POST /api/v1/users', () => {
  const validBody = { name: 'Juan Pérez', username: 'juan.perez', password: 'pass123', role: 'delivery' };

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/v1/users').send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 403 for delivery role', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${deliveryToken}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('returns 400 when required fields missing', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Juan' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid role', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...validBody, role: 'superadmin' });
    expect(res.status).toBe(400);
  });

  it('returns 201 and created user for admin', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [mockUser] });
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('returns 409 on duplicate username', async () => {
    mockPool.query.mockRejectedValueOnce({ code: '23505' });
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('ya existe');
  });
});

// ─── PATCH /users/:id ─────────────────────────────────────────────────────────

describe('PATCH /api/v1/users/:id', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).patch('/api/v1/users/2').send({ active: false });
    expect(res.status).toBe(401);
  });

  it('returns 403 for delivery role', async () => {
    const res = await request(app)
      .patch('/api/v1/users/2')
      .set('Authorization', `Bearer ${deliveryToken}`)
      .send({ active: false });
    expect(res.status).toBe(403);
  });

  it('returns 200 on successful update', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...mockUser, active: false }] });
    const res = await request(app)
      .patch('/api/v1/users/2')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: false });
    expect(res.status).toBe(200);
    expect(res.body.active).toBe(false);
  });

  it('returns 404 when user not found', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .patch('/api/v1/users/999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: false });
    expect(res.status).toBe(404);
  });
});

// ─── GET /users/:id/stats ─────────────────────────────────────────────────────

describe('GET /api/v1/users/:id/stats', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/users/2/stats');
    expect(res.status).toBe(401);
  });

  it('returns 403 for delivery role', async () => {
    const res = await request(app)
      .get('/api/v1/users/2/stats')
      .set('Authorization', `Bearer ${deliveryToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 when user not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/v1/users/999/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('returns stats for existing driver', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [mockUser] })
      .mockResolvedValueOnce({ rows: [{ total_delivered: '14', delivered_last_30_days: '5', total_amount: '280000' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'SH-123', total: 20000, created_at: '2026-06-17T12:00:00Z', customer_name: 'Maria Garcia' }] });
    const res = await request(app)
      .get('/api/v1/users/2/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalDelivered', 14);
    expect(res.body).toHaveProperty('totalAmount', 280000);
    expect(res.body).toHaveProperty('recentOrders');
    expect(res.body.recentOrders).toHaveLength(1);
    expect(res.body.recentOrders[0]).toHaveProperty('customer_name', 'Maria Garcia');
  });

  it('returns zero stats when driver has no delivered orders', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [mockUser] })
      .mockResolvedValueOnce({ rows: [{ total_delivered: '0', delivered_last_30_days: '0', total_amount: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/v1/users/2/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalDelivered', 0);
    expect(res.body).toHaveProperty('deliveredLast30Days', 0);
    expect(res.body).toHaveProperty('totalAmount', 0);
    expect(res.body.recentOrders).toHaveLength(0);
  });
});
