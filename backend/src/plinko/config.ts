/**
 * Plinko paytables and probability weights per (rows, risk).
 * RTP = sum(weight[i] * multiplier[i]). Target ~94% per config.
 * Weights are binomial-like (higher in center, rare at edges).
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

const CONFIGS: Record<string, SlotConfig> = {
  // ---- 8 rows -> 9 slots ----
  '8_low': {
    multipliers: [5, 2, 1.1, 0.9, 0.5, 0.9, 1.1, 2, 5],
    weights: [0.004, 0.031, 0.109, 0.219, 0.273, 0.219, 0.109, 0.031, 0.004],
  },
  '8_medium': {
    multipliers: [11, 3, 1.2, 0.7, 0.35, 0.7, 1.2, 3, 11],
    weights: [0.004, 0.031, 0.109, 0.219, 0.273, 0.219, 0.109, 0.031, 0.004],
  },
  '8_high': {
    multipliers: [21, 4, 1.5, 0.32, 0.2, 0.32, 1.5, 4, 21],
    weights: [0.004, 0.031, 0.109, 0.219, 0.273, 0.219, 0.109, 0.031, 0.004],
  },

  // ---- 10 rows -> 11 slots ----
  '10_low': {
    multipliers: [10, 3.5, 1.7, 1.1, 0.8, 0.5, 0.8, 1.1, 1.7, 3.5, 10],
    weights: [0.001, 0.01, 0.044, 0.117, 0.205, 0.246, 0.205, 0.117, 0.044, 0.01, 0.001],
  },
  '10_medium': {
    multipliers: [26, 5, 2, 1.2, 0.6, 0.35, 0.6, 1.2, 2, 5, 26],
    weights: [0.001, 0.01, 0.044, 0.117, 0.205, 0.246, 0.205, 0.117, 0.044, 0.01, 0.001],
  },
  '10_high': {
    multipliers: [72, 9, 2.2, 0.9, 0.45, 0.1, 0.45, 0.9, 2.2, 9, 72],
    weights: [0.001, 0.01, 0.044, 0.117, 0.205, 0.246, 0.205, 0.117, 0.044, 0.01, 0.001],
  },

  // ---- 12 rows -> 13 slots ----
  '12_low': {
    multipliers: [22, 4, 1.9, 1.3, 1, 0.85, 0.6, 0.85, 1, 1.3, 1.9, 4, 22],
    weights: [0.0002, 0.003, 0.016, 0.054, 0.121, 0.193, 0.226, 0.193, 0.121, 0.054, 0.016, 0.003, 0.0002],
  },
  '12_medium': {
    multipliers: [50, 11, 3.5, 1.8, 0.9, 0.6, 0.4, 0.6, 0.9, 1.8, 3.5, 11, 50],
    weights: [0.0002, 0.003, 0.016, 0.054, 0.121, 0.193, 0.226, 0.193, 0.121, 0.054, 0.016, 0.003, 0.0002],
  },
  '12_high': {
    multipliers: [70, 20, 5.5, 2.2, 0.9, 0.35, 0.1, 0.35, 0.9, 2.2, 5.5, 20, 70],
    weights: [0.0002, 0.003, 0.016, 0.054, 0.121, 0.193, 0.226, 0.193, 0.121, 0.054, 0.016, 0.003, 0.0002],
  },

  // ---- 14 rows -> 15 slots ----
  '14_low': {
    multipliers: [18, 5.5, 2.6, 1.7, 1.2, 1.05, 0.8, 0.6, 0.8, 1.05, 1.2, 1.7, 2.6, 5.5, 18],
    weights: [0.00006, 0.001, 0.006, 0.022, 0.061, 0.122, 0.183, 0.209, 0.183, 0.122, 0.061, 0.022, 0.006, 0.001, 0.00006],
  },
  '14_medium': {
    multipliers: [65, 18, 6, 2.8, 1.4, 0.9, 0.6, 0.4, 0.6, 0.9, 1.4, 2.8, 6, 18, 65],
    weights: [0.00006, 0.001, 0.006, 0.022, 0.061, 0.122, 0.183, 0.209, 0.183, 0.122, 0.061, 0.022, 0.006, 0.001, 0.00006],
  },
  '14_high': {
    multipliers: [480, 67, 13.5, 4.3, 1.5, 0.5, 0.2, 0.1, 0.2, 0.5, 1.5, 4.3, 13.5, 67, 480],
    weights: [0.00006, 0.001, 0.006, 0.022, 0.061, 0.122, 0.183, 0.209, 0.183, 0.122, 0.061, 0.022, 0.006, 0.001, 0.00006],
  },

  // ---- 16 rows -> 17 slots (NEW) ----
  // Binomial weights from C(16,k)/65536
  '16_low': {
    multipliers: [16, 7, 3.2, 2, 1.4, 1.1, 0.9, 0.7, 1.03, 0.7, 0.9, 1.1, 1.4, 2, 3.2, 7, 16],
    weights: [0.000015, 0.000244, 0.001831, 0.008545, 0.027771, 0.066650, 0.122192, 0.174561, 0.196381, 0.174561, 0.122192, 0.066650, 0.027771, 0.008545, 0.001831, 0.000244, 0.000015],
  },
  '16_medium': {
    multipliers: [88, 30, 9, 4, 2, 1.2, 0.7, 0.4, 1.22, 0.4, 0.7, 1.2, 2, 4, 9, 30, 88],
    weights: [0.000015, 0.000244, 0.001831, 0.008545, 0.027771, 0.066650, 0.122192, 0.174561, 0.196381, 0.174561, 0.122192, 0.066650, 0.027771, 0.008545, 0.001831, 0.000244, 0.000015],
  },
  '16_high': {
    multipliers: [1000, 120, 25, 7, 2.5, 0.8, 0.3, 0.15, 1.37, 0.15, 0.3, 0.8, 2.5, 7, 25, 120, 1000],
    weights: [0.000015, 0.000244, 0.001831, 0.008545, 0.027771, 0.066650, 0.122192, 0.174561, 0.196381, 0.174561, 0.122192, 0.066650, 0.027771, 0.008545, 0.001831, 0.000244, 0.000015],
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

// Ensure all paytables are safe for casino use on load.
verifyRTP();
