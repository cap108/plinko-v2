import type { RowCount } from '@plinko-v2/shared';
import {
  BOARD_WIDTH,
  BOUNDS_MARGIN,
  PEG_COLLISION_R,
  DROP_X,
  DROP_Y,
  ROW_HEIGHT_FACTOR,
  PEG_SPACING_FACTOR,
  SLOT_ROW_HEIGHT,
  getPegPositions,
  getSlotXBounds,
  getSlotY,
  getBallRadiusForRows,
  type PegPosition,
} from './boardLayout';

// ---- Simulation output types ----

export interface SimPosition {
  simTime: number;
  x: number;
  y: number;
}

export interface PegHitEvent {
  simTime: number;
  rowIndex: number;
  pegIndex: number;
  globalIndex: number;
}

export interface SimulationResult {
  positions: SimPosition[];
  pegHits: PegHitEvent[];
  totalSimTime: number;
  finalX: number;
  finalY: number;
  landedSlot: number;
}

// ---- Deterministic path constants ----
// These produce natural-looking Galton-board arcs.

const DET_T_DROP = 500; // ms from spawn to first peg hit
const DET_T_ROW = 700; // ms per inter-peg arc
const DET_FINE_STEPS = 20; // position samples per arc segment
const DET_DROP_STEPS = 10; // position samples for the initial drop
const PHASE3_TIME_SCALE = 1.3; // final arc into slot is slightly slower

// ---- Core simulation function ----

/**
 * Builds a fully deterministic path from drop point to target slot.
 *
 * Uses Bresenham distribution to evenly spread L/R decisions across rows,
 * then constructs physically plausible parabolic arcs between pegs.
 * The ball hits exactly one peg per row and always lands in the target slot.
 */
export function simulate(
  rows: RowCount,
  slotIndex: number,
  ballRadius?: number,
): SimulationResult {
  const br = ballRadius ?? getBallRadiusForRows(rows);
  const pegs = getPegPositions(rows);
  const slotY = getSlotY(rows);
  // Slot geometry: top = slotY - SLOT_ROW_HEIGHT/2, bottom = slotY + SLOT_ROW_HEIGHT/2
  const slotTop = slotY - SLOT_ROW_HEIGHT / 2;
  const slotBottom = slotY + SLOT_ROW_HEIGHT / 2;
  // Y-clamp for inter-peg arcs (don't overshoot into the slot)
  const maxLandingY = slotTop + br;
  // The ball comes to rest near the slot bottom
  const slotFloorY = slotBottom - br;

  const slots = rows + 1;
  const sw = BOARD_WIDTH / slots;
  const rh = sw * ROW_HEIGHT_FACTOR;
  const spacing = sw * PEG_SPACING_FACTOR;

  // Clamp slot index
  const clampedSlot = Math.max(0, Math.min(slots - 1, slotIndex));

  // ---- Bresenham L/R distribution ----
  // Distribute exactly `clampedSlot` right-decisions across `rows` rows.
  const decisions: boolean[] = []; // true = right, false = left
  let bErr = 0;
  for (let r = 0; r < rows; r++) {
    bErr += clampedSlot;
    if (bErr * 2 >= rows) {
      decisions.push(true); // go right
      bErr -= rows;
    } else {
      decisions.push(false); // go left
    }
  }

  // Fisher-Yates shuffle for visual variety (preserves total L/R count)
  for (let i = decisions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [decisions[i], decisions[j]] = [decisions[j], decisions[i]];
  }

  // ---- Resolve which peg is hit on each row ----
  const hitPegs: PegPosition[] = [];
  // Row 0 always hits the single peg (index 0)
  // For subsequent rows, the peg index depends on cumulative rights
  let pegCol = 0; // column index in the current row
  for (let r = 0; r < rows; r++) {
    if (r > 0) {
      // After a right decision at row r-1, the ball shifts right in the peg grid
      pegCol += decisions[r - 1] ? 1 : 0;
    }
    // Find the peg at (rowIndex=r, pegIndex=pegCol)
    const peg = pegs.find((p) => p.rowIndex === r && p.pegIndex === pegCol);
    if (peg) {
      hitPegs.push(peg);
    }
  }

  // ---- Build positions ----
  const positions: SimPosition[] = [];
  const pegHits: PegHitEvent[] = [];

  // Physics constants for arcs
  const V_BOUNCE = (2 * rh) / DET_T_ROW;
  const g_eff = (6 * rh) / (DET_T_ROW * DET_T_ROW);

  // Phase 1: Drop to row-0 peg
  const firstPeg = hitPegs[0];
  positions.push({ simTime: 0, x: DROP_X, y: DROP_Y });

  for (let i = 1; i <= DET_DROP_STEPS; i++) {
    const frac = i / DET_DROP_STEPS;
    const simTime = frac * DET_T_DROP;
    const x = DROP_X + (firstPeg.x - DROP_X) * frac;
    const y = DROP_Y + (firstPeg.y - DROP_Y) * frac * frac; // ease-in (gravity)
    positions.push({ simTime, x, y });
  }

  pegHits.push({
    simTime: DET_T_DROP,
    rowIndex: 0,
    pegIndex: firstPeg.pegIndex,
    globalIndex: firstPeg.globalIndex,
  });

  // Phase 2: Inter-peg arcs
  for (let r = 0; r < rows - 1; r++) {
    const peg = hitPegs[r];
    const nextPeg = hitPegs[r + 1];
    const arcStart = DET_T_DROP + r * DET_T_ROW;
    const dx = nextPeg.x - peg.x;

    for (let i = 1; i <= DET_FINE_STEPS; i++) {
      const frac = i / DET_FINE_STEPS;
      const t = frac * DET_T_ROW;
      const yPhysics = peg.y - V_BOUNCE * t + 0.5 * g_eff * t * t;
      positions.push({
        simTime: arcStart + t,
        x: peg.x + dx * frac,
        y: Math.min(yPhysics, maxLandingY),
      });
    }

    pegHits.push({
      simTime: DET_T_DROP + (r + 1) * DET_T_ROW,
      rowIndex: r + 1,
      pegIndex: nextPeg.pegIndex,
      globalIndex: nextPeg.globalIndex,
    });
  }

  // Phase 3: Final arc from last peg into slot
  // Same V_BOUNCE / g_eff parabola as inter-peg arcs. The arc continues the
  // natural trajectory all the way down to slotFloorY (bottom of the slot).
  const lastPeg = hitPegs[rows - 1];
  const lastDecision = decisions[rows - 1];
  const finalArcStart = DET_T_DROP + (rows - 1) * DET_T_ROW;
  const finalDy = slotFloorY - lastPeg.y;

  // Solve: -V_BOUNCE*t + 0.5*g_eff*t² = finalDy for landing time
  const disc = V_BOUNCE * V_BOUNCE + 2 * g_eff * finalDy;
  const finalT = (V_BOUNCE + Math.sqrt(Math.max(0, disc))) / g_eff;

  // Horizontal target: half pegSpacing in the decision direction (same as
  // inter-peg dx when going left or right)
  const dxToSlot = (lastDecision ? 1 : -1) * (spacing / 2);

  for (let i = 1; i <= DET_FINE_STEPS; i++) {
    const frac = i / DET_FINE_STEPS;
    const t = frac * finalT;
    const yVal = Math.min(
      lastPeg.y - V_BOUNCE * t + 0.5 * g_eff * t * t,
      slotFloorY,
    );
    positions.push({
      simTime: finalArcStart + t,
      x: lastPeg.x + dxToSlot * frac,
      y: yVal,
    });
  }

  // Phase 4: Settling bounces in the slot
  const SETTLE_DAMPING = 0.4;
  const SETTLE_STEPS = 6; // samples per micro-bounce
  const landX = lastPeg.x + dxToSlot;
  const slotBounds = getSlotXBounds(rows, clampedSlot);
  let driftVx = dxToSlot * 0.3;
  let settleTime = finalArcStart + finalT;
  let currentX = landX;
  let bounceHeight = (slotFloorY - lastPeg.y) * 0.15; // small first bounce

  for (let bounce = 0; bounce < 3 && bounceHeight > 0.3; bounce++) {
    const tHalf = Math.sqrt((2 * bounceHeight) / g_eff);
    const bounceDuration = tHalf * 2;
    const bounceDrift = driftVx;
    const startX = currentX;

    for (let i = 1; i <= SETTLE_STEPS; i++) {
      const frac = i / SETTLE_STEPS;
      const t = frac * bounceDuration;
      const yVal = slotFloorY - bounceHeight * (1 - ((t / tHalf) - 1) ** 2);
      // Clamp x within slot bounds
      const xVal = Math.max(
        slotBounds.left + br,
        Math.min(slotBounds.right - br, startX + bounceDrift * frac),
      );
      positions.push({
        simTime: settleTime + t,
        x: xVal,
        y: Math.min(yVal, slotFloorY),
      });
    }

    currentX = Math.max(
      slotBounds.left + br,
      Math.min(slotBounds.right - br, startX + bounceDrift),
    );
    driftVx *= SETTLE_DAMPING;
    settleTime += bounceDuration;
    bounceHeight *= SETTLE_DAMPING;
  }

  // Final resting position
  positions.push({ simTime: settleTime + 1, x: currentX, y: slotFloorY });
  const totalSimTime = settleTime + 1;

  // ---- Peg collision pushout ----
  // Nudge any positions that ended up inside a peg's visual radius outward.
  const phase3StartIdx = 1 + DET_DROP_STEPS + (rows - 1) * DET_FINE_STEPS;
  for (const peg of hitPegs) {
    for (let i = 0; i < phase3StartIdx && i < positions.length; i++) {
      const p = positions[i];
      const pdx = p.x - peg.x;
      const pdy = p.y - peg.y;
      const dist = Math.hypot(pdx, pdy);
      if (dist > 0 && dist < PEG_COLLISION_R) {
        const scale = PEG_COLLISION_R / dist;
        positions[i] = {
          simTime: p.simTime,
          x: peg.x + pdx * scale,
          y: peg.y + pdy * scale,
        };
      }
    }
  }

  // ---- Wall clamping ----
  const minX = br + BOUNDS_MARGIN;
  const maxX = BOARD_WIDTH - br - BOUNDS_MARGIN;
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    if (p.x < minX) positions[i] = { ...p, x: minX };
    else if (p.x > maxX) positions[i] = { ...p, x: maxX };
  }

  const lastPos = positions[positions.length - 1];

  return {
    positions,
    pegHits,
    totalSimTime,
    finalX: lastPos.x,
    finalY: lastPos.y,
    landedSlot: clampedSlot,
  };
}
