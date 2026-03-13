import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { Mutex } from 'async-mutex';
import { createHash } from 'crypto';
import rateLimit from 'express-rate-limit';
import type { RowCount, RiskLevel } from '@plinko-v2/shared';
import type { Store } from '../store.js';
import { resolveOutcome } from '../plinko/engine.js';
import {
  ALLOWED_ROWS, ALLOWED_RISK, DEFAULT_ROWS, DEFAULT_RISK,
  MIN_BET, MAX_BET, INITIAL_BALANCE_CENTS, MAX_BET_COUNT,
  getAllPaytables,
} from '../plinko/config.js';
import { logger } from '../logger.js';

// ---- IP Hashing ----

const IP_HASH_SALT = process.env.IP_HASH_SALT ?? 'plinko-v2-dev-salt';

if (!process.env.IP_HASH_SALT && process.env.NODE_ENV === 'production') {
  logger.warn('IP_HASH_SALT not set — using default dev salt. Set this env var in production.');
}

function hashIp(ip: string): string {
  return createHash('sha256').update(IP_HASH_SALT + ip).digest('hex').slice(0, 16);
}

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

// ---- Per-Session Mutex ----

const sessionLocks = new Map<string, Mutex>();

function getSessionLock(sessionId: string): Mutex {
  let lock = sessionLocks.get(sessionId);
  if (!lock) {
    lock = new Mutex();
    sessionLocks.set(sessionId, lock);
  }
  return lock;
}

export function cleanupSessionLocks(activeSessionIds: Set<string>): void {
  for (const sessionId of sessionLocks.keys()) {
    if (!activeSessionIds.has(sessionId)) {
      sessionLocks.delete(sessionId);
    }
  }
}

// ---- BetError ----

class BetError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'BetError';
  }
}

// ---- Zod Schemas ----

const SessionIdSchema = z.string().uuid({ message: 'Invalid sessionId format' });

const BetBodySchema = z.object({
  sessionId: SessionIdSchema,
  betAmount: z.number().finite()
    .min(MIN_BET, `betAmount must be at least ${MIN_BET}`)
    .max(MAX_BET, `betAmount must be at most ${MAX_BET}`),
  rows: z.number().refine(
    (v): v is (typeof ALLOWED_ROWS)[number] =>
      (ALLOWED_ROWS as readonly number[]).includes(v),
    { message: `rows must be one of ${ALLOWED_ROWS.join(', ')}` },
  ),
  riskLevel: z.enum(['low', 'medium', 'high'] as const),
  count: z.number().int().min(1).max(MAX_BET_COUNT).optional().default(1),
});

const SessionIdQuerySchema = z.object({ sessionId: SessionIdSchema });

const HistoryQuerySchema = z.object({
  sessionId: SessionIdSchema,
  limit: z.string().optional()
    .transform(v => v !== undefined ? parseInt(v, 10) : 20)
    .pipe(z.number().min(1).max(100)),
});

// ---- Per-Route Rate Limiters ----

const sessionCreateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sessions created. Please try again later.' },
});

const betLimit = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: "You're betting too fast. Please wait a moment." },
});

// ---- Router Factory ----

export function createRouter(store: Store): Router {
  const router = Router();

  // GET /api/health (moved from index.ts)
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // POST /api/session
  router.post('/session', sessionCreateLimit as unknown as import('express').RequestHandler, (req: Request, res: Response) => {
    if (store.sessionCount() >= 10_000) {
      logger.warn({ ip: clientIp(req) }, 'Session creation rejected: max sessions reached');
      res.status(503).json({ error: 'Service unavailable' });
      return;
    }

    const ipHash = hashIp(clientIp(req));

    if (store.countSessionsByIp(ipHash, Date.now() - 3_600_000) >= 10) {
      res.status(429).json({ error: 'Too many sessions created. Please try again later.' });
      return;
    }

    const sessionId = uuidv4();
    const record = store.createSession(sessionId, INITIAL_BALANCE_CENTS, ipHash);
    logger.info({ sessionId, ip: clientIp(req) }, 'Session created');
    res.json({ sessionId: record.sessionId, balance: record.balanceCents / 100 });
  });

  // GET /api/config?sessionId=...
  router.get('/config', (req: Request, res: Response) => {
    const parse = SessionIdQuerySchema.safeParse(req.query);
    if (!parse.success) {
      res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }
    const { sessionId } = parse.data;
    const session = store.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({
      rows: [...ALLOWED_ROWS],
      riskLevels: [...ALLOWED_RISK],
      paytables: getAllPaytables(),
      defaultRows: DEFAULT_ROWS,
      defaultRisk: DEFAULT_RISK,
      minBet: MIN_BET,
      maxBet: MAX_BET,
      maxBallCount: MAX_BET_COUNT,
    });
  });

  // POST /api/plinko/bet
  router.post('/plinko/bet', betLimit as unknown as import('express').RequestHandler, async (req: Request, res: Response) => {
    const parse = BetBodySchema.safeParse(req.body);
    if (!parse.success) {
      const message = parse.error.issues[0]?.message ?? 'Invalid request';
      logger.warn({ ip: clientIp(req), error: message }, 'Bet rejected: invalid request');
      res.status(400).json({ error: message });
      return;
    }
    const { sessionId, betAmount, rows, riskLevel, count } = parse.data;

    // Fast-fail if session doesn't exist
    if (!store.getSession(sessionId)) {
      logger.warn({ sessionId, ip: clientIp(req) }, 'Bet rejected: session not found');
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    const betAmountCents = Math.round(betAmount * 100);
    const totalBetCents = betAmountCents * count;

    try {
      const result = await getSessionLock(sessionId).runExclusive(async () => {
        // Re-read session inside the lock (authoritative)
        const session = store.getSession(sessionId);
        if (!session) throw new BetError(404, 'Session not found');

        if (session.balanceCents < totalBetCents) {
          logger.warn({ sessionId, balance: session.balanceCents, totalBetCents }, 'Bet rejected: insufficient balance');
          throw new BetError(400, 'Insufficient balance');
        }

        // Wrap in SQLite transaction for atomicity
        const bets = store.transaction(() => {
          let currentBalance = session.balanceCents;

          const results: Array<{
            roundId: string;
            slotIndex: number;
            multiplier: number;
            winAmount: number;
            balance: number;
          }> = [];

          for (let i = 0; i < count; i++) {
            currentBalance -= betAmountCents;

            const outcome = resolveOutcome(rows, riskLevel, betAmountCents);
            if (!outcome) {
              throw new BetError(500, 'Config error');
            }

            currentBalance += outcome.winAmountCents;
            store.updateBalance(sessionId, currentBalance);

            const roundId = uuidv4();
            store.appendHistory({
              sessionId,
              roundId,
              betCents: betAmountCents,
              rows,
              riskLevel,
              slotIndex: outcome.slotIndex,
              multiplier: outcome.multiplier,
              winCents: outcome.winAmountCents,
              balanceCents: currentBalance,
              timestamp: Date.now(),
              serverSeedHash: null,
              nonce: null,
            });

            results.push({
              roundId,
              slotIndex: outcome.slotIndex,
              multiplier: outcome.multiplier,
              winAmount: outcome.winAmountCents / 100,
              balance: currentBalance / 100,
            });
          }

          return results;
        });

        logger.info({
          sessionId,
          count,
          totalBet: totalBetCents,
          finalBalance: bets[bets.length - 1]?.balance,
        }, 'Batch bet resolved');

        return { bets };
      });

      res.json(result);
    } catch (err) {
      if (err instanceof BetError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      logger.error({ err, sessionId }, 'Unexpected error in bet handler');
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // GET /api/balance?sessionId=...
  router.get('/balance', (req: Request, res: Response) => {
    const parse = SessionIdQuerySchema.safeParse(req.query);
    if (!parse.success) {
      res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }
    const { sessionId } = parse.data;
    const session = store.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ balance: session.balanceCents / 100 });
  });

  // GET /api/history?sessionId=...&limit=N
  router.get('/history', (req: Request, res: Response) => {
    const parse = HistoryQuerySchema.safeParse(req.query);
    if (!parse.success) {
      res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }
    const { sessionId, limit } = parse.data;
    const session = store.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    const records = store.getHistory(sessionId, limit);
    res.json({
      history: records.map(rec => ({
        roundId: rec.roundId,
        betAmount: rec.betCents / 100,
        slotIndex: rec.slotIndex,
        multiplier: rec.multiplier,
        winAmount: rec.winCents / 100,
        balance: rec.balanceCents / 100,
        timestamp: rec.timestamp,
        rows: rec.rows as RowCount,
        riskLevel: rec.riskLevel as RiskLevel,
      })),
    });
  });

  return router;
}
