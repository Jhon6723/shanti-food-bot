import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { SSEService, type SSEEvent } from '../../src/application/SSEService.js';

// Helper to create an isolated app with the SSE route wired to a fresh SSEService.
// After `closeAfterMs` the route ends the response so supertest can read the body.
function createSSEApp(service: SSEService, closeAfterMs = 200) {
  const app = express();

  app.get('/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    res.write('data: {"type":"connected"}\n\n');

    const unsubscribe = service.subscribe((event: SSEEvent) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    });

    req.on('close', () => {
      unsubscribe();
      if (!res.writableEnded) res.end();
    });

    // Close automatically after a delay so supertest can capture the body
    setTimeout(() => {
      unsubscribe();
      if (!res.writableEnded) res.end();
    }, closeAfterMs);
  });

  return app;
}

describe('SSE endpoint', () => {
  it('returns correct SSE headers', async () => {
    const service = new SSEService();
    const app = createSSEApp(service, 50);

    const res = await request(app).get('/events');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['connection']).toBe('keep-alive');
  });

  it('sends initial connected event', async () => {
    const service = new SSEService();
    const app = createSSEApp(service, 50);

    const res = await request(app).get('/events');

    expect(res.text).toContain('data: {"type":"connected"}');
  });

  it('receives broadcasted events through the stream', async () => {
    const service = new SSEService();
    const app = createSSEApp(service, 300);

    // Broadcast after a short delay so the subscriber is registered
    setTimeout(() => {
      service.broadcast({ type: 'orderUpdated', data: { id: 'SH-001', status: 'confirmed' } });
    }, 50);

    const res = await request(app).get('/events');

    expect(res.text).toContain('event: orderUpdated');
    expect(res.text).toContain('data: {"id":"SH-001","status":"confirmed"}');
  });

  it('removes subscriber on response close', async () => {
    const service = new SSEService();
    const app = createSSEApp(service, 50);

    expect(service.subscriberCount).toBe(0);

    await request(app).get('/events');

    expect(service.subscriberCount).toBe(0);
  });
});
