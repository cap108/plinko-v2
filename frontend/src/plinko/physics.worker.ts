import { simulate } from './physics';
import {
  encodePositions,
  encodePegHits,
  type WorkerRequest,
  type WorkerResponse,
} from './workerProtocol';

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;

  if (msg.type === 'simulate') {
    try {
      const result = simulate(msg.rows, msg.slotIndex, msg.ballRadius);

      const positions = encodePositions(result.positions);
      const pegHits = encodePegHits(result.pegHits);

      const response: WorkerResponse = {
        type: 'result',
        id: msg.id,
        positions,
        pegHits,
        totalSimTime: result.totalSimTime,
        finalX: result.finalX,
        finalY: result.finalY,
        landedSlot: result.landedSlot,
      };

      // Transfer the ArrayBuffers for zero-copy
      self.postMessage(response, [positions.buffer, pegHits.buffer]);
    } catch (err) {
      const response: WorkerResponse = {
        type: 'error',
        id: msg.id,
        message: err instanceof Error ? err.message : String(err),
      };
      self.postMessage(response);
    }
  }
};
