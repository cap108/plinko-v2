/**
 * Plinko outcome resolution. Outcome is computed only here, after bet is validated.
 * Uses only server-side crypto RNG; no client input affects the draw.
 */
import { randomBytes } from 'crypto';
import { getConfig } from './config.js';

export interface PlinkoOutcome {
  slotIndex: number;
  multiplier: number;
  /** Win amount in integer cents. */
  winAmountCents: number;
}

/**
 * Returns a random number in [0, 1) using crypto (for weighted sample).
 */
function randomFloat(): number {
  const buf = randomBytes(4);
  const u32 = buf.readUInt32BE(0);
  return u32 / (0xffff_ffff + 1);
}

/**
 * Sample slot index from discrete distribution (weights sum to 1).
 */
function weightedSample(weights: number[]): number {
  const r = randomFloat();
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (r < acc) return i;
  }
  return weights.length - 1;
}

/**
 * Resolve one Plinko round.
 * @param betAmountCents - Bet amount in integer cents (e.g. 150 = $1.50).
 * @returns Outcome with winAmountCents as an integer number of cents, or null if config not found.
 */
export function resolveOutcome(
  rows: number,
  risk: string,
  betAmountCents: number,
): PlinkoOutcome | null {
  const config = getConfig(rows, risk);
  if (!config || config.multipliers.length === 0) return null;

  const slotIndex = weightedSample(config.weights);
  const multiplier = config.multipliers[slotIndex] ?? 0;
  const winAmountCents = Math.round(betAmountCents * multiplier);

  return { slotIndex, multiplier, winAmountCents };
}
