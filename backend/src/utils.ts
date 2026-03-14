import { Mutex } from 'async-mutex';
import { createHash } from 'crypto';

export class BetError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'BetError';
  }
}

const IP_HASH_SALT = process.env.IP_HASH_SALT ?? 'plinko-v2-dev-salt';

export function hashIp(ip: string): string {
  return createHash('sha256').update(IP_HASH_SALT + ip).digest('hex').slice(0, 16);
}

const sessionLocks = new Map<string, Mutex>();

export function getSessionLock(sessionId: string): Mutex {
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
