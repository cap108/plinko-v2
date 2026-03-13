import type { RowCount } from '@plinko-v2/shared';
import { simulate, type SimulationResult } from './physics';
import {
  decodePositions,
  decodePegHits,
  type WorkerRequest,
  type WorkerResponse,
} from './workerProtocol';

type PendingResolve = {
  resolve: (result: SimulationResult) => void;
  reject: (err: Error) => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, PendingResolve>();
let workerFailed = false;

function getWorker(): Worker | null {
  if (workerFailed) return null;
  if (worker) return worker;

  try {
    worker = new Worker(
      new URL('./physics.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);

      if (msg.type === 'error') {
        entry.reject(new Error(msg.message));
      } else {
        entry.resolve({
          positions: decodePositions(msg.positions),
          pegHits: decodePegHits(msg.pegHits),
          totalSimTime: msg.totalSimTime,
          finalX: msg.finalX,
          finalY: msg.finalY,
          landedSlot: msg.landedSlot,
        });
      }
    };

    worker.onerror = () => {
      console.warn('Physics worker failed, falling back to main thread');
      workerFailed = true;
      worker?.terminate();
      worker = null;

      // Reject all pending requests — they'll be retried on main thread by callers
      for (const [, entry] of pending) {
        entry.reject(new Error('Worker failed'));
      }
      pending.clear();
    };

    console.log('Physics worker initialized');
    return worker;
  } catch {
    console.warn('Could not create physics worker, using main thread');
    workerFailed = true;
    return null;
  }
}

/**
 * Run a physics simulation, preferring the Web Worker.
 * Falls back to synchronous main-thread simulation on worker failure.
 */
export function simulateAsync(
  rows: RowCount,
  slotIndex: number,
  ballRadius?: number,
): Promise<SimulationResult> {
  const w = getWorker();

  if (!w) {
    // Main-thread fallback
    return Promise.resolve(simulate(rows, slotIndex, ballRadius));
  }

  const id = nextId++;

  return new Promise<SimulationResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });

    const msg: WorkerRequest = {
      type: 'simulate',
      id,
      rows,
      slotIndex,
      ballRadius,
    };

    w.postMessage(msg);
  }).catch(() => {
    // If worker failed for this specific request, fall back
    return simulate(rows, slotIndex, ballRadius);
  });
}

/** Returns true if the worker is active (not failed). */
export function isWorkerActive(): boolean {
  return !workerFailed;
}

/** Terminate the worker (cleanup on unmount). */
export function terminateWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  for (const [, entry] of pending) {
    entry.reject(new Error('Worker terminated'));
  }
  pending.clear();
}
