// Express app factory — separated from server startup for testability

import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { join } from 'path';
import authRouter from './api/routes/auth.js';
import configRouter from './api/routes/config.js';
import eventsRouter from './api/routes/events.js';
import ordersRouter from './api/routes/orders.js';
import productsRouter from './api/routes/products.js';
import usersRouter from './api/routes/users.js';
import webhookRouter from './api/routes/webhook.js';

// Rate limiting (issue #5 — SECURITY.md)
// Webhook: 30 requests/min per IP — WhatsApp providers retry on non-200, so be generous
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many webhook requests, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth: 10 login attempts per 15 min per IP — prevents brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API: 100 requests/min per IP — protects against abuse
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

export function createApp(beforeRoutes?: (app: express.Express) => void) {
  const app = express();

  // Capture raw body for webhook signature verification
  // Note: verify callback receives http.IncomingMessage, not Express.Request
  app.use(express.json({
    verify: (req, _res, buf: Buffer) => {
      (req as Request & { rawBody?: string }).rawBody = buf.toString();
    }
  }));
  app.use(express.urlencoded({ extended: true }));

  // Allow caller to inject middleware (CORS, logging, etc.) before routes are registered
  if (beforeRoutes) beforeRoutes(app);

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'shanti-food-api', timestamp: new Date().toISOString() });
  });

  app.use('/api/v1/auth', authLimiter, authRouter);
  app.use('/api/v1/config', apiLimiter, configRouter);
  app.use('/api/v1/events', apiLimiter, eventsRouter);
  app.use('/api/v1/orders', apiLimiter, ordersRouter);
  app.use('/api/v1/products', apiLimiter, productsRouter);
  app.use('/api/v1/users', apiLimiter, usersRouter);
  app.use('/api/v1/webhooks', webhookLimiter, webhookRouter);

  // Serve admin SPA static build
  const adminDist = join(process.cwd(), 'admin', 'dist');
  app.use('/admin', express.static(adminDist));
  app.get('/admin/*', (_req: Request, res: Response) => {
    res.sendFile(join(adminDist, 'index.html'));
  });

  app.get('/', (_req: Request, res: Response) => {
    res.json({ name: 'Shanti Food API', version: '1.0.0' });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  return app;
}
