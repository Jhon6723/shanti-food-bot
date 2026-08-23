// Entry point: Shanti Food WhatsApp Bot API
// Spec Driven Development implementation

import './config/env.js';

import cors from 'cors';
import { createServer } from 'http';
import { createApp } from './app.js';
import { initDatabase, pool } from './infrastructure/database/connection.js';

// CORS — allow admin SPA origin in production and localhost for dev
const allowedOrigins = [
  'https://shanti-bot.pixpro.lat',
  'http://localhost:5173',
  'http://localhost:3000',
];

// Request / Response logging
function loggingMiddleware(app: import('express').Express) {
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }));

  app.use((req, res, next) => {
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
}

const app = createApp(loggingMiddleware);
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Health check — includes DB readiness for monitoring (overrides the simple one in app.ts)
let dbReady = false;
let isShuttingDown = false;
app.get('/health', async (_req, res) => {
  if (isShuttingDown) {
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

// Root endpoint with detailed info (overrides the simple one in app.ts)
app.get('/', (_req, res) => {
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
