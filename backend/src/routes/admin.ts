import { Router, type Request, type Response } from 'express';
import { adminRateLimit, adminAuth } from '../admin/auth.js';
import { AdminStore } from '../admin/adminStore.js';
import { Store } from '../store.js';
import { getEffectiveConfig, getEffectiveRTPReport, getEffectivePaytables, computeRTP, MIN_BET_CENTS, MAX_BET_CENTS, MAX_BET_COUNT, INITIAL_BALANCE_CENTS } from '../plinko/config.js';
import { BetError, hashIp, getSessionLock } from '../utils.js';
import { z } from 'zod';
import { logger } from '../logger.js';

// ---- Zod Schemas ----

const AdminConfigUpdateSchema = z.object({
  minBetCents: z.number().int().min(1).max(1_000_000).nullable().optional(),
  maxBetCents: z.number().int().min(1).max(10_000_000).nullable().optional(),
  maxBetCount: z.number().int().min(1).max(1000).nullable().optional(),
  initialBalanceCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  maintenanceMode: z.boolean().nullable().optional(),
  paytableOverrides: z.record(
    z.string().regex(/^\d+_(low|medium|high)$/),
    z.object({
      multipliers: z.array(z.number().finite().min(0)).min(1).max(50),
      weights: z.array(z.number().finite().min(0)).min(1).max(50),
    }).refine(d => d.multipliers.length === d.weights.length, {
      message: 'multipliers and weights must have same length',
    })
  ).nullable().optional(),
}).refine(data => {
  if (data.minBetCents != null && data.maxBetCents != null) {
    return data.minBetCents <= data.maxBetCents;
  }
  return true;
}, { message: 'minBetCents must be <= maxBetCents' });

const SessionListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  guestId: z.string().uuid().optional(),
  ipHash: z.string().regex(/^[0-9a-f]{16}$/).optional(),
});

const SessionIdParamSchema = z.object({ id: z.string().uuid() });

const ResetBalanceSchema = z.object({
  balanceCents: z.number().int().min(0).max(100_000_000),
});

// ---- Router Factory ----

export function createAdminRouter(store: Store, adminStore: AdminStore): Router {
  const router = Router();

  // Auth middleware applied to ALL admin routes
  router.use(adminRateLimit, adminAuth);

  // GET /api/admin/config
  router.get('/config', (_req: Request, res: Response) => {
    const effective = getEffectiveConfig();
    const overrides = adminStore.getAllConfigOverrides();
    const rtpReport = getEffectiveRTPReport();

    // Include full paytable data so the admin editor can pre-populate with actual values
    const paytables = getEffectivePaytables();

    res.json({
      defaults: {
        minBetCents: MIN_BET_CENTS,
        maxBetCents: MAX_BET_CENTS,
        maxBetCount: MAX_BET_COUNT,
        initialBalanceCents: INITIAL_BALANCE_CENTS,
      },
      overrides,
      effective,
      rtpReport,
      paytables,
    });
  });

  // PUT /api/admin/config
  router.put('/config', (req: Request, res: Response) => {
    const parse = AdminConfigUpdateSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }
    const data = parse.data;

    // Cross-validate minBetCents <= maxBetCents considering existing overrides
    if (data.minBetCents !== undefined || data.maxBetCents !== undefined) {
      const currentEffective = getEffectiveConfig();
      const newMin = data.minBetCents ?? currentEffective.minBetCents;
      const newMax = data.maxBetCents ?? currentEffective.maxBetCents;
      if (newMin != null && newMax != null && newMin > newMax) {
        res.status(400).json({ error: `minBetCents (${newMin}) must be <= maxBetCents (${newMax})` });
        return;
      }
    }

    // Validate paytable slot count matches row count
    if (data.paytableOverrides && data.paytableOverrides !== null) {
      for (const [key, config] of Object.entries(data.paytableOverrides)) {
        const rows = parseInt(key.split('_')[0], 10);
        const expectedSlots = rows + 1;
        if (config.multipliers.length !== expectedSlots) {
          res.status(400).json({
            error: `Paytable ${key}: expected ${expectedSlots} slots (rows+1), got ${config.multipliers.length}`,
          });
          return;
        }

        // Tighten RTP upper bound to 99% for admin overrides
        const rtp = computeRTP(config);
        if (rtp < 0.90 - 1e-6 || rtp > 0.99 + 1e-6) {
          res.status(400).json({
            error: `Paytable ${key}: RTP ${(rtp * 100).toFixed(2)}% outside valid range [90%, 99%]`,
          });
          return;
        }
      }
    }

    // Wrap all config writes in a transaction for atomicity
    const ipHash = hashIp(req.ip ?? 'unknown');
    const changes: string[] = [];

    adminStore.transaction(() => {
      for (const [key, value] of Object.entries(data)) {
        if (value === undefined) continue;
        if (value === null) {
          adminStore.deleteConfigValue(key);
          changes.push(`removed ${key}`);
        } else {
          adminStore.setConfigValue(key, value);
          changes.push(`set ${key}`);
        }
      }
    });

    // Log RTP in audit entry for traceability
    const rtpReport = getEffectiveRTPReport();
    adminStore.appendAuditLog('config.update', { changes, data, rtpReport }, ipHash);
    logger.info({ changes, ip: req.ip }, 'Admin config updated');

    const effective = getEffectiveConfig();
    res.json({ ok: true, effective, rtpReport });
  });

  // GET /api/admin/sessions
  router.get('/sessions', (req: Request, res: Response) => {
    const parse = SessionListSchema.safeParse(req.query);
    if (!parse.success) {
      res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }
    const { page, pageSize, guestId, ipHash } = parse.data;
    const filters = (guestId || ipHash) ? { guestId, ipHash } : undefined;
    const result = adminStore.listSessions(page, pageSize, filters);
    res.json({ ...result, page, pageSize });
  });

  // GET /api/admin/sessions/:id
  router.get('/sessions/:id', (req: Request, res: Response) => {
    const parse = SessionIdParamSchema.safeParse(req.params);
    if (!parse.success) {
      res.status(400).json({ error: 'Invalid session ID' });
      return;
    }
    const detail = adminStore.getSessionDetail(parse.data.id);
    if (!detail) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(detail);
  });

  // POST /api/admin/sessions/:id/reset-balance
  router.post('/sessions/:id/reset-balance', async (req: Request, res: Response) => {
    const paramParse = SessionIdParamSchema.safeParse(req.params);
    if (!paramParse.success) {
      res.status(400).json({ error: 'Invalid session ID' });
      return;
    }
    const bodyParse = ResetBalanceSchema.safeParse(req.body);
    if (!bodyParse.success) {
      res.status(400).json({ error: bodyParse.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }

    const { id } = paramParse.data;
    const { balanceCents } = bodyParse.data;

    const lock = getSessionLock(id);
    try {
      await lock.runExclusive(() => {
        const success = adminStore.resetSessionBalance(id, balanceCents);
        if (!success) throw new BetError(404, 'Session not found');
      });

      const ipHash = hashIp(req.ip ?? 'unknown');
      adminStore.appendAuditLog('session.reset', { sessionId: id, balanceCents }, ipHash);
      logger.info({ sessionId: id, balanceCents, ip: req.ip }, 'Admin reset session balance');
      res.json({ ok: true, balanceCents });
    } catch (err) {
      if (err instanceof BetError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // DELETE /api/admin/sessions/:id
  router.delete('/sessions/:id', async (req: Request, res: Response) => {
    const parse = SessionIdParamSchema.safeParse(req.params);
    if (!parse.success) {
      res.status(400).json({ error: 'Invalid session ID' });
      return;
    }
    const { id } = parse.data;

    const lock = getSessionLock(id);
    try {
      await lock.runExclusive(() => {
        // Log session summary before deletion
        const detail = adminStore.getSessionDetail(id);
        if (!detail) throw new BetError(404, 'Session not found');

        const summary = {
          sessionId: id,
          finalBalance: detail.session.balanceCents,
          roundCount: detail.session.roundCount,
        };

        const success = adminStore.deleteSession(id);
        if (!success) throw new BetError(404, 'Session not found');

        const ipHash = hashIp(req.ip ?? 'unknown');
        adminStore.appendAuditLog('session.delete', summary, ipHash);
        logger.info({ sessionId: id, ip: req.ip }, 'Admin deleted session');
      });
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof BetError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Internal error' });
    }
  });

  // POST /api/admin/sessions/purge-expired
  router.post('/sessions/purge-expired', (_req: Request, res: Response) => {
    const count = store.cleanupExpiredSessions();
    res.json({ ok: true, purged: count });
  });

  // GET /api/admin/stats
  router.get('/stats', (_req: Request, res: Response) => {
    const effective = getEffectiveConfig();
    const stats = adminStore.getGlobalStats(effective.maintenanceMode);
    res.json(stats);
  });

  // GET /api/admin/rtp-report
  router.get('/rtp-report', (_req: Request, res: Response) => {
    const configured = getEffectiveRTPReport();
    const observed = adminStore.getRtpByPaytable();
    res.json({ configured, observed });
  });

  return router;
}
