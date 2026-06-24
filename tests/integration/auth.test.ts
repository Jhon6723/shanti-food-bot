// Integration tests: POST /api/v1/auth/login

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
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

describe('POST /api/v1/auth/login', () => {
  it('returns 400 when username missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: 'secret' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when password missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 when user not found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'noexiste', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Credenciales inválidas');
  });

  it('returns 401 when user is inactive', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, username: 'admin', password_hash: 'hash', role: 'admin', active: false, name: 'Admin' }],
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'secret' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when password is wrong', async () => {
    const hash = await bcrypt.hash('correct-password', 10);
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, username: 'admin', password_hash: hash, role: 'admin', active: true, name: 'Admin' }],
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Credenciales inválidas');
  });

  it('returns 200 with token and role on valid credentials', async () => {
    const hash = await bcrypt.hash('admin123', 10);
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, username: 'admin', password_hash: hash, role: 'admin', active: true, name: 'Administrador' }],
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.role).toBe('admin');
    expect(res.body.name).toBe('Administrador');

    const decoded = jwt.verify(res.body.token, TEST_JWT_SECRET) as { userId: number; role: string };
    expect(decoded.userId).toBe(1);
    expect(decoded.role).toBe('admin');
  });

  it('returns delivery role token for delivery user', async () => {
    const hash = await bcrypt.hash('driver123', 10);
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 2, username: 'carlos_r', password_hash: hash, role: 'delivery', active: true, name: 'Carlos' }],
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'carlos_r', password: 'driver123' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('delivery');
  });

  // P8: Delivery dashboard optional — block delivery login when disabled
  it('returns 403 when delivery dashboard is disabled and user is delivery (P8)', async () => {
    const prev = process.env.DELIVERY_DASHBOARD_ENABLED;
    process.env.DELIVERY_DASHBOARD_ENABLED = 'false';
    const hash = await bcrypt.hash('driver123', 10);
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 2, username: 'carlos_r', password_hash: hash, role: 'delivery', active: true, name: 'Carlos' }],
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'carlos_r', password: 'driver123' });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('deshabilitado');
    process.env.DELIVERY_DASHBOARD_ENABLED = prev;
  });

  it('allows admin login when delivery dashboard is disabled (P8)', async () => {
    const prev = process.env.DELIVERY_DASHBOARD_ENABLED;
    process.env.DELIVERY_DASHBOARD_ENABLED = 'false';
    const hash = await bcrypt.hash('admin123', 10);
    mockPool.query.mockResolvedValueOnce({
      rows: [{ id: 1, username: 'admin', password_hash: hash, role: 'admin', active: true, name: 'Admin' }],
    });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('admin');
    process.env.DELIVERY_DASHBOARD_ENABLED = prev;
  });
});
