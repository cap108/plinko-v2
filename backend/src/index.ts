import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';
import { initDb } from './db.js';

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

const db = initDb();

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
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
}) as unknown as express.RequestHandler);

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

// ---- Body parser (before rate limiting so Phase 3 per-route limiters can read req.body) ----
app.use(express.json({ limit: '4kb' }));

// ---- Request logging (before rate limiting so 429s are logged for security monitoring) ----
app.use(pinoHttp({ logger }));

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

// ---- Health check ----
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

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
    db.close();
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
