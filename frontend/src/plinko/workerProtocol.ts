import type { RowCount } from '@plinko-v2/shared';

// ---- Main thread → Worker messages ----

export interface SimulateRequest {
  type: 'simulate';
  id: number;
  rows: RowCount;
  slotIndex: number;
  ballRadius?: number;
}

export type WorkerRequest = SimulateRequest;

// ---- Worker → Main thread messages ----

export interface SimulateResponse {
  type: 'result';
  id: number;
  /** Flat Float32Array: [simTime, x, y, simTime, x, y, ...] */
  positions: Float32Array;
  /** Flat array: [simTime, rowIndex, pegIndex, globalIndex, ...] */
  pegHits: Float32Array;
  totalSimTime: number;
  finalX: number;
  finalY: number;
  landedSlot: number;
}

export interface ErrorResponse {
  type: 'error';
  id: number;
  message: string;
}

export type WorkerResponse = SimulateResponse | ErrorResponse;

// ---- Encoding / decoding helpers ----

/** Pack SimPosition[] into a transferable Float32Array (3 floats per position). */
export function encodePositions(
  positions: { simTime: number; x: number; y: number }[],
): Float32Array {
  const arr = new Float32Array(positions.length * 3);
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    arr[i * 3] = p.simTime;
    arr[i * 3 + 1] = p.x;
    arr[i * 3 + 2] = p.y;
  }
  return arr;
}

/** Unpack Float32Array back into SimPosition[]. */
export function decodePositions(
  arr: Float32Array,
): { simTime: number; x: number; y: number }[] {
  const count = arr.length / 3;
  const positions: { simTime: number; x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    positions.push({
      simTime: arr[i * 3],
      x: arr[i * 3 + 1],
      y: arr[i * 3 + 2],
    });
  }
  return positions;
}

/** Pack PegHitEvent[] into a transferable Float32Array (4 floats per event). */
export function encodePegHits(
  hits: {
    simTime: number;
    rowIndex: number;
    pegIndex: number;
    globalIndex: number;
  }[],
): Float32Array {
  const arr = new Float32Array(hits.length * 4);
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    arr[i * 4] = h.simTime;
    arr[i * 4 + 1] = h.rowIndex;
    arr[i * 4 + 2] = h.pegIndex;
    arr[i * 4 + 3] = h.globalIndex;
  }
  return arr;
}

/** Unpack Float32Array back into PegHitEvent[]. */
export function decodePegHits(
  arr: Float32Array,
): {
  simTime: number;
  rowIndex: number;
  pegIndex: number;
  globalIndex: number;
}[] {
  const count = arr.length / 4;
  const hits: {
    simTime: number;
    rowIndex: number;
    pegIndex: number;
    globalIndex: number;
  }[] = [];
  for (let i = 0; i < count; i++) {
    hits.push({
      simTime: arr[i * 4],
      rowIndex: arr[i * 4 + 1],
      pegIndex: arr[i * 4 + 2],
      globalIndex: arr[i * 4 + 3],
    });
  }
  return hits;
}
