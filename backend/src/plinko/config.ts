/**
 * Plinko paytables and probability weights per (rows, risk).
 * Multipliers based on Stake/BGaming Plinko (the industry standard).
 * Weights are exact binomial: C(n,k) / 2^n — each peg is a fair 50/50 coin flip.
 * RTP ≈ 99% (house edge ~1%), matching major crypto Plinko games.
 */
import type { RowCount, RiskLevel, Paytable } from '@plinko-v2/shared';

export const ALLOWED_ROWS: readonly RowCount[] = [8, 10, 12, 14, 16];
export const ALLOWED_RISK: readonly RiskLevel[] = ['low', 'medium', 'high'];
export const DEFAULT_ROWS: RowCount = 10;
export const DEFAULT_RISK: RiskLevel = 'medium';

/** Dollar-denominated constants exposed to the frontend for display. */
export const MIN_BET = 0.1;
export const MAX_BET = 1000;

/** Cent-denominated constants for internal arithmetic. */
export const MIN_BET_CENTS = 10;
export const MAX_BET_CENTS = 100_000;
export const INITIAL_BALANCE_CENTS = 100_000; // $1000.00

/** Maximum number of balls that can be resolved in a single batch bet request. */
export const MAX_BET_COUNT = 100;

export interface SlotConfig {
  multipliers: number[];
  weights: number[]; // raw weights — normalized via normalizedWeights() at access time
}

function configKey(rows: number, risk: string): string {
  return `${rows}_${risk}`;
}

/** Compute exact binomial weights: C(n,k) / 2^n for k = 0..n */
function binomialWeights(n: number): number[] {
  const total = 2 ** n;
  const weights: number[] = [];
  let c = 1; // C(n, 0) = 1
  for (let k = 0; k <= n; k++) {
    weights.push(c / total);
    c = c * (n - k) / (k + 1);
  }
  return weights;
}

const w8 = binomialWeights(8);
const w10 = binomialWeights(10);
const w12 = binomialWeights(12);
const w14 = binomialWeights(14);
const w16 = binomialWeights(16);

const CONFIGS: Record<string, SlotConfig> = {
  // ---- 8 rows -> 9 slots ----
  // Stake/BGaming confirmed multipliers
  '8_low': {
    multipliers: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
    weights: w8,
  },
  '8_medium': {
    multipliers: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
    weights: w8,
  },
  '8_high': {
    multipliers: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
    weights: w8,
  },

  // ---- 10 rows -> 11 slots ----
  '10_low': {
    multipliers: [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
    weights: w10,
  },
  '10_medium': {
    multipliers: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
    weights: w10,
  },
  '10_high': {
    multipliers: [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76],
    weights: w10,
  },

  // ---- 12 rows -> 13 slots ----
  // Stake/BGaming confirmed multipliers
  '12_low': {
    multipliers: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
    weights: w12,
  },
  '12_medium': {
    multipliers: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
    weights: w12,
  },
  '12_high': {
    multipliers: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
    weights: w12,
  },

  // ---- 14 rows -> 15 slots ----
  '14_low': {
    multipliers: [7.1, 4, 1.9, 1.4, 1.3, 1.1, 1, 0.5, 1, 1.1, 1.3, 1.4, 1.9, 4, 7.1],
    weights: w14,
  },
  '14_medium': {
    multipliers: [43, 14, 6.5, 3, 1.4, 1, 0.7, 0.4, 0.7, 1, 1.4, 3, 6.5, 14, 43],
    weights: w14,
  },
  '14_high': {
    multipliers: [420, 56, 18, 5, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5, 18, 56, 420],
    weights: w14,
  },

  // ---- 16 rows -> 17 slots ----
  // Stake/BGaming confirmed multipliers
  '16_low': {
    multipliers: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    weights: w16,
  },
  '16_medium': {
    multipliers: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    weights: w16,
  },
  '16_high': {
    multipliers: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
    weights: w16,
  },
};

/** Normalize weights to sum to exactly 1.0 for correct sampling. */
function normalizedWeights(weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights;
  const normalized = weights.map(w => w / sum);
  // Adjust last weight to ensure exact sum = 1.0 (prevents floating-point drift)
  normalized[normalized.length - 1] += 1.0 - normalized.reduce((a, b) => a + b, 0);
  return normalized;
}

export function getConfig(rows: number, risk: string): SlotConfig | undefined {
  const key = configKey(rows, risk);
  const raw = CONFIGS[key];
  if (!raw) return undefined;
  return {
    multipliers: raw.multipliers,
    weights: normalizedWeights(raw.weights),
  };
}

/**
 * Compute RTP for a config using normalized weights. RTP = sum(weight[i] * multiplier[i]).
 */
export function computeRTP(raw: SlotConfig): number {
  const weights = normalizedWeights(raw.weights);
  return weights.reduce((acc, w, i) => acc + w * (raw.multipliers[i] ?? 0), 0);
}

/**
 * Returns RTP (as decimal 0-1) for each configuration key.
 */
export function getRTPReport(): Record<string, number> {
  const report: Record<string, number> = {};
  for (const [key, raw] of Object.entries(CONFIGS)) {
    report[key] = computeRTP(raw);
  }
  return report;
}

/**
 * Verify all configs are safe: RTP in [90%, 100%].
 * Called at module load. Throws if any config is invalid.
 */
export function verifyRTP(): void {
  const MIN_RTP = 0.90 - 1e-6;
  const MAX_RTP = 1.00 + 1e-6;
  for (const [key, raw] of Object.entries(CONFIGS)) {
    const rtp = computeRTP(raw);
    if (rtp > MAX_RTP) {
      throw new Error(`Plinko config ${key}: RTP ${(rtp * 100).toFixed(2)}% exceeds 100% (house would lose)`);
    }
    if (rtp < MIN_RTP) {
      throw new Error(`Plinko config ${key}: RTP ${(rtp * 100).toFixed(2)}% below 90%`);
    }
  }
}

export function getPaytable(rows: number, risk: string): number[] | undefined {
  return getConfig(rows, risk)?.multipliers;
}

export function getAllPaytables(): Record<string, Paytable> {
  const out: Record<string, Paytable> = {};
  for (const [k, v] of Object.entries(CONFIGS)) {
    out[k] = {
      multipliers: v.multipliers,
      probabilities: normalizedWeights(v.weights),
    };
  }
  return out;
}

// ---- Config Override System ----

/** Interface for config override lookups. Implemented by AdminStore. */
export interface ConfigOverrideProvider {
  getAllConfigOverrides(): Record<string, unknown>;
}

let _overrideProvider: ConfigOverrideProvider | null = null;

export function setOverrideProvider(provider: ConfigOverrideProvider): void {
  _overrideProvider = provider;
}

export interface EffectiveGameConfig {
  minBetCents: number;
  maxBetCents: number;
  maxBetCount: number;
  initialBalanceCents: number;
  maintenanceMode: boolean;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Returns effective config: hardcoded defaults merged with DB overrides.
 * Called on every request — SQLite reads are ~0.05ms, no caching needed.
 */
export function getEffectiveConfig(): EffectiveGameConfig {
  const overrides = _overrideProvider?.getAllConfigOverrides() ?? {};
  return {
    minBetCents: clamp(overrides.minBetCents, 1, 1_000_000, MIN_BET_CENTS),
    maxBetCents: clamp(overrides.maxBetCents, 1, 10_000_000, MAX_BET_CENTS),
    maxBetCount: clamp(overrides.maxBetCount, 1, 1000, MAX_BET_COUNT),
    initialBalanceCents: clamp(overrides.initialBalanceCents, 0, 100_000_000, INITIAL_BALANCE_CENTS),
    maintenanceMode: typeof overrides.maintenanceMode === 'boolean' ? overrides.maintenanceMode : false,
  };
}

export function getEffectiveSlotConfig(rows: number, risk: string): SlotConfig | undefined {
  const key = configKey(rows, risk);
  const overrides = _overrideProvider?.getAllConfigOverrides() ?? {};
  const paytableOverrides = overrides.paytableOverrides as Record<string, { multipliers: number[]; weights: number[] }> | undefined;

  if (paytableOverrides?.[key]) {
    const override = paytableOverrides[key];
    return {
      multipliers: override.multipliers,
      weights: normalizedWeights(override.weights),
    };
  }
  return getConfig(rows, risk);
}

export function getEffectivePaytables(): Record<string, Paytable> {
  const base = getAllPaytables();
  const overrides = _overrideProvider?.getAllConfigOverrides() ?? {};
  const paytableOverrides = overrides.paytableOverrides as Record<string, { multipliers: number[]; weights: number[] }> | undefined;

  if (paytableOverrides) {
    for (const [key, override] of Object.entries(paytableOverrides)) {
      base[key] = {
        multipliers: override.multipliers,
        probabilities: normalizedWeights(override.weights),
      };
    }
  }
  return base;
}

export function getEffectiveRTPReport(): Record<string, number> {
  const base = getRTPReport();
  const overrides = _overrideProvider?.getAllConfigOverrides() ?? {};
  const paytableOverrides = overrides.paytableOverrides as Record<string, { multipliers: number[]; weights: number[] }> | undefined;

  if (paytableOverrides) {
    for (const [key, override] of Object.entries(paytableOverrides)) {
      base[key] = computeRTP(override);
    }
  }
  return base;
}

// Ensure all paytables are safe for casino use on load.
verifyRTP();
