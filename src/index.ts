// Entry point: Shanti Food WhatsApp Bot API
// Spec Driven Development implementation

import './config/env.js';

import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer } from 'http';
import { join } from 'path';
import { initDatabase, pool } from './infrastructure/database/connection.js';

import authRouter from './api/routes/auth.js';
import categoriesRouter from './api/routes/categories.js';
import eventsRouter from './api/routes/events.js';
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
app.use(express.json({
  verify: (req, _res, buf: Buffer) => {
    (req as Request & { rawBody?: string }).rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ extended: true }));

// Request / Response logging
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const reqId = `${req.method} ${req.path}`;
  console.log(`${new Date().toISOString()} - → ${reqId}`);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const level = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'OK';
    console.log(`${new Date().toISOString()} - ← ${reqId} ${status} (${duration}ms) [${level}]`);
  });

  next();
});

// Health check — includes DB readiness for monitoring
let dbReady = false;
let isShuttingDown = false;
app.get('/health', async (_req: Request, res: Response) => {
  if (isShuttingDown) {
    // Return 503 during graceful shutdown so Traefik removes this container from the pool
    return res.status(503).json({ status: 'shutting_down', ready: false, timestamp: new Date().toISOString() });
  }
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    res.json({ status: 'ok', db: 'connected', ready: dbReady, timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected', ready: false, timestamp: new Date().toISOString() });
  }
});

// API Routes per OpenAPI spec
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/categories', categoriesRouter);
app.use('/api/v1/events', eventsRouter);
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
  const server = createServer(app);

  // Graceful shutdown: on SIGTERM, mark as shutting down, wait 10s for Traefik to detect 503, then close
  process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received — initiating graceful shutdown');
    isShuttingDown = true;

    // Give Traefik 10s to detect the 503 health check and remove this container from the pool
    setTimeout(() => {
      console.log('🔌 Closing HTTP server');
      server.close(() => {
        console.log('✅ Server closed gracefully');
        process.exit(0);
      });

      // Force exit after 15s if server.close() hangs
      setTimeout(() => {
        console.error('⚠️ Server did not close gracefully — forcing exit');
        process.exit(1);
      }, 5000);
    }, 10000);
  });

  // Start listening immediately — don't block on DB init
  server.listen(PORT, () => {
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
  • GET  /api/v1/events            - SSE real-time events
  • POST /api/v1/webhooks/whatsapp - WhatsApp webhook${isDev ? `
  • GET  /api/v1/webhooks/test     - Test bot (dev only)` : ''}

Docker:
  docker-compose up -d
${isDev ? `
Bot Test:
  curl "http://localhost:${PORT}/api/v1/webhooks/test?phone=3123456789&message=hola"` : ''}
`);
  });

  // Initialize DB in the background so health checks respond immediately
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    console.log('✅ PostgreSQL connected');
  } catch (err) {
    console.error('❌ PostgreSQL connection failed:', (err as Error).message);
    console.error('Make sure the database is running and DATABASE_URL is correct.');
    return;
  }

  try {
    await initDatabase();
    dbReady = true;
    console.log('✅ Database schema initialized');
  } catch (err) {
    console.error('❌ Database initialization failed:', (err as Error).message);
    // Server keeps running — health check will show ready: false
  }
}

startServer();

export default app;
