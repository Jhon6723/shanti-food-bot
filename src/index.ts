// Entry point: Shanti Food WhatsApp Bot API
// Spec Driven Development implementation

import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import { pool } from './infrastructure/database/connection.js';

import ordersRouter from './api/routes/orders.js';
import productsRouter from './api/routes/products.js';
import webhookRouter from './api/routes/webhook.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'shanti-food-api',
    timestamp: new Date().toISOString(),
  });
});

// API Routes per OpenAPI spec
app.use('/api/v1/orders', ordersRouter);
app.use('/api/v1/products', productsRouter);
app.use('/api/v1/webhooks', webhookRouter);

// Root redirect to API
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Shanti Food API',
    version: '1.0.0',
    description: 'WhatsApp Bot for Arrocería Shanti',
    endpoints: {
      health: '/health',
      orders: '/api/v1/orders',
      products: '/api/v1/products',
      webhook: '/api/v1/webhooks/whatsapp',
      botTest: '/api/v1/webhooks/test?phone=XXX&message=hola',
    },
    specs: 'See specs/openapi.yaml for full API specification',
  });
});

// Error handling
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

async function startServer() {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ PostgreSQL connected');
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', (err as Error).message);
    console.error('Make sure the database is running and DATABASE_URL is correct.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`
🍚 Arrocería Shanti API running on port ${PORT}

API Endpoints:
  • GET  /health                    - Health check
  • GET  /api/v1/products          - Menu products
  • POST /api/v1/orders            - Create order
  • GET  /api/v1/orders            - List orders
  • POST /api/v1/webhooks/whatsapp - WhatsApp webhook
  • GET  /api/v1/webhooks/test     - Test bot (query: phone, message)

Docker:
  docker-compose up -d

Bot Test:
  curl "http://localhost:${PORT}/api/v1/webhooks/test?phone=3123456789&message=hola"
`);
  });
}

startServer();

export default app;
