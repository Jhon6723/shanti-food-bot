// Entry point: Shanti Food WhatsApp Bot API
// Spec Driven Development implementation

import './config/env.js';

import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { join } from 'path';
import { initDatabase, pool } from './infrastructure/database/connection.js';

import authRouter from './api/routes/auth.js';
import categoriesRouter from './api/routes/categories.js';
import ordersRouter from './api/routes/orders.js';
import productsRouter from './api/routes/products.js';
import usersRouter from './api/routes/users.js';
import webhookRouter from './api/routes/webhook.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// CORS — allow admin SPA origin in production and localhost for dev
const allowedOrigins = [
  'https://shanti-bot.pixpro.lat',
  'http://localhost:5173',
  'http://localhost:3000',
];
app.use(cors({
  origin: (origin, cb) => {
    // allow requests with no origin (curl, Postman, webhook)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

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
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/categories', categoriesRouter);
app.use('/api/v1/orders', ordersRouter);
app.use('/api/v1/products', productsRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/webhooks', webhookRouter);

// Serve admin SPA static build
const adminDist = join(process.cwd(), 'admin', 'dist');
app.use('/admin', express.static(adminDist));
app.get('/admin/*', (_req: Request, res: Response) => {
  res.sendFile(join(adminDist, 'index.html'));
});

// Root redirect to API
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Shanti Food API',
    version: '1.0.0',
    description: 'WhatsApp Bot for Arrocería Shanti',
    endpoints: {
      health: '/health',
      login: '/api/v1/auth/login',
      orders: '/api/v1/orders',
      products: '/api/v1/products',
      users: '/api/v1/users',
      webhook: '/api/v1/webhooks/whatsapp',
      ...(process.env.NODE_ENV !== 'production' && {
        botTest: '/api/v1/webhooks/test?phone=XXX&message=hola',
      }),
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
    await initDatabase();
    console.log('✅ Database schema initialized');
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', (err as Error).message);
    console.error('Make sure the database is running and DATABASE_URL is correct.');
    process.exit(1);
  }

  app.listen(PORT, () => {
    const isDev = process.env.NODE_ENV !== 'production';
    const whatsappProvider = process.env.WHATSAPP_PROVIDER || 'meta';
    console.log(`
🍚 Arrocería Shanti API running on port ${PORT}
📱 WhatsApp Provider: ${whatsappProvider.toUpperCase()}

API Endpoints:
  • GET  /health                    - Health check
  • GET  /api/v1/products          - Menu products
  • POST /api/v1/orders            - Create order
  • GET  /api/v1/orders            - List orders
  • POST /api/v1/webhooks/whatsapp - WhatsApp webhook${isDev ? `
  • GET  /api/v1/webhooks/test     - Test bot (dev only)` : ''}

Docker:
  docker-compose up -d
${isDev ? `
Bot Test:
  curl "http://localhost:${PORT}/api/v1/webhooks/test?phone=3123456789&message=hola"` : ''}
`);
  });
}

startServer();

export default app;
