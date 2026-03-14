import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';
import { initDb } from './db.js';
import { Store } from './store.js';
import { createRouter } from './routes/index.js';
import { AdminStore } from './admin/adminStore.js';
import { createAdminRouter } from './routes/admin.js';
import { setOverrideProvider } from './plinko/config.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

const db = initDb();
const store = new Store(db);
store.startCleanupInterval();

const adminStore = new AdminStore(db);
setOverrideProvider(adminStore);

// ---- Trust proxy ----
if (process.env.BEHIND_TLS_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// ---- CORS ----
const nodeEnv = process.env.NODE_ENV ?? '';
const isLocalEnv = nodeEnv === '' || nodeEnv === 'development' || nodeEnv === 'test';

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : isLocalEnv
    ? ['http://localhost:5173', 'http://localhost:4173']
    : false; // deny all cross-origin in production if not configured

app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false,
  maxAge: 86400, // Cache preflight for 24h — reduces OPTIONS request overhead for cross-origin calls
}) as unknown as express.RequestHandler);

if (!isLocalEnv && !process.env.CORS_ORIGINS) {
  logger.warn('CORS_ORIGINS not set in production — all cross-origin requests will be blocked');
}

// ---- Security headers ----
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      workerSrc: ["'self'", 'blob:'],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  hsts: { maxAge: 31_536_000, includeSubDomains: true },
}) as unknown as express.RequestHandler);

// ---- Request logging (before rate limiting so 429s are logged for security monitoring) ----
app.use(pinoHttp({ logger }));

// ---- Health endpoint (before rate limiter so Railway health checks always succeed) ----
app.get('/api/health', (_req, res) => {
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

// ---- Rate limiting ----
app.use(rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
}));

// ---- No-cache for API responses ----
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// CRITICAL: Mount admin routes with 64kb body parser BEFORE the global 4kb parser
const adminRouter = createAdminRouter(store, adminStore);
app.use('/api/admin', express.json({ limit: '64kb' }), adminRouter);

// MOVED: Global 4kb body parser (was before rate limiting, now after admin mount)
app.use(express.json({ limit: '4kb' }));

// ---- API routes ----
app.use('/api', createRouter(store));

// ---- Start ----
const server = app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server listening');
});

// ---- Graceful shutdown ----
const shutdown = () => {
  logger.info('Shutting down');
  // Force exit after 5s if graceful close hangs
  const forceTimer = setTimeout(() => process.exit(1), 5000);
  forceTimer.unref();
  server.close(() => {
    store.stopCleanupInterval();
    try { db.pragma('wal_checkpoint(PASSIVE)'); } catch { /* best effort */ }
    db.close();
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
