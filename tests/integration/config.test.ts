// Integration tests: GET /api/v1/config/public (P8 — delivery dashboard optional)

import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';

vi.mock('../../src/infrastructure/database/connection.js', () => ({
  pool: { query: vi.fn() },
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

describe('GET /api/v1/config/public', () => {
  afterEach(() => {
    delete process.env.DELIVERY_DASHBOARD_ENABLED;
  });

  it('returns deliveryDashboardEnabled=true by default', async () => {
    const res = await request(app).get('/api/v1/config/public');
    expect(res.status).toBe(200);
    expect(res.body.deliveryDashboardEnabled).toBe(true);
  });

  it('returns deliveryDashboardEnabled=false when env var is "false"', async () => {
    process.env.DELIVERY_DASHBOARD_ENABLED = 'false';
    const res = await request(app).get('/api/v1/config/public');
    expect(res.status).toBe(200);
    expect(res.body.deliveryDashboardEnabled).toBe(false);
  });

  it('returns deliveryDashboardEnabled=true when env var is "true"', async () => {
    process.env.DELIVERY_DASHBOARD_ENABLED = 'true';
    const res = await request(app).get('/api/v1/config/public');
    expect(res.status).toBe(200);
    expect(res.body.deliveryDashboardEnabled).toBe(true);
  });

  it('does not require authentication', async () => {
    const res = await request(app).get('/api/v1/config/public');
    expect(res.status).toBe(200);
  });
});
