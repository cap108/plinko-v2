import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual, createHash } from 'crypto';
import rateLimit from 'express-rate-limit';
import { logger } from '../logger.js';

const ADMIN_SECRET = process.env.ADMIN_SECRET;

export const adminRateLimit = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many admin requests. Please wait.' },
});

function safeCompare(a: string, b: string): boolean {
  const bufA = createHash('sha256').update(a).digest();
  const bufB = createHash('sha256').update(b).digest();
  return timingSafeEqual(bufA, bufB);
}

export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_SECRET) {
    logger.error('ADMIN_SECRET env var is not set — admin routes disabled');
    res.status(503).json({ error: 'Admin interface not configured' });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);
  if (!safeCompare(token, ADMIN_SECRET)) {
    logger.warn({ ip: req.ip }, 'Admin auth failed: invalid token');
    res.status(401).json({ error: 'Invalid admin token' });
    return;
  }

  next();
}
