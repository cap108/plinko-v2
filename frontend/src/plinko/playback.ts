import type { SimPosition, PegHitEvent, SimulationResult } from './physics';

// ---- Speed presets ----
export type SpeedPreset = 'slow' | 'regular' | 'turbo';

const SPEED_MULTIPLIERS: Record<SpeedPreset, number> = {
  slow: 0.5,
  regular: 1.0,
  turbo: 2.5,
};

// ---- Playback state for a single ball ----

export interface BallPlayback {
  /** Unique id for this ball animation. */
  id: number;
  /** Pre-computed path positions. */
  positions: SimPosition[];
  /** Peg hit events, sorted by simTime. */
  pegHits: PegHitEvent[];
  /** Total simulated duration in ms. */
  totalSimTime: number;
  /** Playback start time (performance.now()). */
  startTime: number;
  /** Speed multiplier applied at start. */
  speed: number;
  /** Next peg hit index to fire. */
  nextPegHitIdx: number;
  /** Target slot index this ball is heading to. */
  slotIndex: number;
  /** True once the ball has landed. */
  landed: boolean;
  /** Wall-clock time when the ball landed (for fade-out timing). */
  landedAt: number;
}

let nextBallId = 1;

/**
 * Create a new BallPlayback from a SimulationResult.
 * Call this when the worker returns and you're ready to animate.
 */
export function createBallPlayback(
  result: SimulationResult,
  speed: SpeedPreset,
  startTime: number,
): BallPlayback {
  return {
    id: nextBallId++,
    positions: result.positions,
    pegHits: result.pegHits,
    totalSimTime: result.totalSimTime,
    startTime,
    speed: SPEED_MULTIPLIERS[speed],
    nextPegHitIdx: 0,
    slotIndex: result.landedSlot,
    landed: false,
    landedAt: 0,
  };
}

// ---- Interpolation ----

export interface InterpolatedPosition {
  x: number;
  y: number;
}

/**
 * Binary-search interpolation of the pre-computed path at a given simTime.
 */
export function interpolatePath(
  positions: SimPosition[],
  simTime: number,
): InterpolatedPosition {
  if (positions.length === 0) return { x: 0, y: 0 };
  if (simTime <= positions[0].simTime) {
    return { x: positions[0].x, y: positions[0].y };
  }
  const last = positions[positions.length - 1];
  if (simTime >= last.simTime) {
    return { x: last.x, y: last.y };
  }

  // Binary search for the bracketing segment
  let lo = 0;
  let hi = positions.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (positions[mid].simTime <= simTime) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const a = positions[lo];
  const b = positions[hi];
  const range = b.simTime - a.simTime;
  const t = range > 0 ? (simTime - a.simTime) / range : 0;

  return {
    x: a.x + t * (b.x - a.x),
    y: a.y + t * (b.y - a.y),
  };
}

// ---- Per-frame update ----

/** Duration in ms for the ball to fade out after landing. */
export const LANDING_FADE_MS = 400;

export interface FrameUpdate {
  /** Current interpolated position. */
  pos: InterpolatedPosition;
  /** Peg hits that fired this frame (may be empty). */
  newPegHits: PegHitEvent[];
  /** True if the ball just landed this frame. */
  justLanded: boolean;
  /** 0..1 progress through the animation. */
  progress: number;
  /** 1..0 alpha for fade-out after landing. */
  alpha: number;
  /** True when the fade-out is complete and the ball can be removed. */
  fadeComplete: boolean;
}

/**
 * Advance a BallPlayback to the current wall-clock time.
 * Returns the frame update, or null only after the fade-out is fully complete.
 */
export function tickBall(
  ball: BallPlayback,
  now: number,
): FrameUpdate | null {
  // Already faded out — safe to remove
  if (ball.landed && ball.landedAt > 0 && now - ball.landedAt >= LANDING_FADE_MS) {
    return null;
  }

  const elapsed = (now - ball.startTime) * ball.speed;
  const simTime = Math.min(elapsed, ball.totalSimTime);
  const progress = ball.totalSimTime > 0 ? simTime / ball.totalSimTime : 1;

  const pos = interpolatePath(ball.positions, simTime);

  // Collect any peg hits that should fire this frame
  const newPegHits: PegHitEvent[] = [];
  while (
    ball.nextPegHitIdx < ball.pegHits.length &&
    ball.pegHits[ball.nextPegHitIdx].simTime <= simTime
  ) {
    newPegHits.push(ball.pegHits[ball.nextPegHitIdx]);
    ball.nextPegHitIdx++;
  }

  // Check landing
  const justLanded = progress >= 1 && !ball.landed;
  if (justLanded) {
    ball.landed = true;
    ball.landedAt = now;
  }

  // Compute fade alpha
  let alpha = 1;
  let fadeComplete = false;
  if (ball.landed && ball.landedAt > 0) {
    const fadeElapsed = now - ball.landedAt;
    alpha = Math.max(0, 1 - fadeElapsed / LANDING_FADE_MS);
    fadeComplete = fadeElapsed >= LANDING_FADE_MS;
  }

  return { pos, newPegHits, justLanded, progress, alpha, fadeComplete };
}
