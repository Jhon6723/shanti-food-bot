// Express app factory — separated from server startup for testability

import express, { type NextFunction, type Request, type Response } from 'express';
import { requireJWT } from './api/middleware/auth.js';
import authRouter from './api/routes/auth.js';
import ordersRouter from './api/routes/orders.js';
import productsRouter from './api/routes/products.js';
import usersRouter from './api/routes/users.js';
import webhookRouter from './api/routes/webhook.js';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'shanti-food-api', timestamp: new Date().toISOString() });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/orders', requireJWT, ordersRouter);
  app.use('/api/v1/products', productsRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/webhooks', webhookRouter);

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
