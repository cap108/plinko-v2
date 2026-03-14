export type EffectEvent =
  | { type: 'pegHit'; rowIndex: number; totalRows: number; x: number; y: number }
  | { type: 'ballMoved'; ballId: number; x: number; y: number; radius: number }
  | { type: 'ballLanded'; x: number; y: number; multiplier: number; slotColor: number }
  | { type: 'ballRemoved'; ballId: number };
