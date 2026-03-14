import type { RowCount } from '@plinko-v2/shared';

// ---- Board geometry constants ----
export const BOARD_WIDTH = 320;
export const BOUNDS_MARGIN = 6;
export const PEG_RADIUS = 1.8;
export const PEG_COLLISION_R = 2.16; // 20% larger than visual for forgiving collisions
export const DROP_X = BOARD_WIDTH / 2; // 160
export const DROP_Y = -4; // Above the top row (startY=24, offset -28)
export const DROP_X_OFFSET_MAX_PX = 10;
export const ROW_HEIGHT_FACTOR = 0.78;
export const PEG_SPACING_FACTOR = 0.86;
export const SLOT_ROW_HEIGHT = 36;
const START_Y = 24;

// ---- Derived helpers ----

function slotWidth(rows: RowCount): number {
  return BOARD_WIDTH / (rows + 1);
}

function rowHeight(rows: RowCount): number {
  return slotWidth(rows) * ROW_HEIGHT_FACTOR;
}

function pegSpacing(rows: RowCount): number {
  return slotWidth(rows) * PEG_SPACING_FACTOR;
}

// ---- Public API ----

export interface PegPosition {
  x: number;
  y: number;
  rowIndex: number;
  pegIndex: number;
  globalIndex: number;
}

/**
 * Returns positions of all pegs on the board.
 * Row r has (r + 1) pegs, centered horizontally.
 */
export function getPegPositions(rows: RowCount): PegPosition[] {
  const spacing = pegSpacing(rows);
  const rh = rowHeight(rows);
  const pegs: PegPosition[] = [];
  let globalIndex = 0;

  for (let r = 0; r < rows; r++) {
    const count = r + 1;
    const startX = (BOARD_WIDTH - (count - 1) * spacing) / 2;
    for (let i = 0; i < count; i++) {
      pegs.push({
        x: startX + i * spacing,
        y: START_Y + r * rh,
        rowIndex: r,
        pegIndex: i,
        globalIndex: globalIndex++,
      });
    }
  }

  return pegs;
}

export interface SlotBounds {
  left: number;
  right: number;
}

/**
 * Returns the left/right x-bounds of a slot.
 * slotIndex is 0-based, range [0, rows].
 */
export function getSlotXBounds(rows: RowCount, slotIndex: number): SlotBounds {
  const spacing = pegSpacing(rows);
  const lastRowCount = rows;
  const startX = (BOARD_WIDTH - (lastRowCount - 1) * spacing) / 2;

  return {
    left: startX + (slotIndex - 1) * spacing,
    right: startX + slotIndex * spacing,
  };
}

/** Returns the x-center of a slot. */
export function getTargetSlotX(rows: RowCount, slotIndex: number): number {
  const { left, right } = getSlotXBounds(rows, slotIndex);
  return (left + right) / 2;
}

/** Returns the y-center of the slot row (below the last peg row). */
export function getSlotY(rows: RowCount): number {
  const rh = rowHeight(rows);
  return START_Y + rows * rh + 12;
}

/** Returns the bottom edge of the slot row. */
export function getSlotBottom(rows: RowCount): number {
  return getSlotY(rows) + SLOT_ROW_HEIGHT / 2;
}

/** Extra height below slots for anchor labels at high row counts. */
export const ANCHOR_LABEL_HEIGHT = 16;

/** Returns total board height from top to bottom of slot row. */
export function getBoardHeight(rows: RowCount): number {
  const extra = rows >= 12 ? ANCHOR_LABEL_HEIGHT : 0;
  return getSlotBottom(rows) + 8 + extra; // small padding below
}

/** Returns the visual ball radius, scaled to row density. */
export function getBallRadiusForRows(rows: RowCount): number {
  const sw = slotWidth(rows);
  const size = sw * 0.5 * 0.8 * 0.75;
  const clamped = Math.max(5, Math.min(size, 18));
  return clamped / 2;
}
