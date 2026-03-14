import { getAudioContext, getMasterGain } from './audioContext';

export interface PegSoundOptions {
  rowIndex: number;
  totalRows: number;
}

let pegSoundsThisFrame = 0;
const MAX_PEG_SOUNDS_PER_FRAME = 6;

/** Reset throttle counter. Call once per tick before processing events. */
export function resetPegSoundThrottle(): void {
  pegSoundsThisFrame = 0;
}

/** Play a short peg-hit sound. No-op if AudioContext unavailable or throttled. */
export function playPegSound(options: PegSoundOptions): void {
  if (pegSoundsThisFrame >= MAX_PEG_SOUNDS_PER_FRAME) return;

  const ctx = getAudioContext();
  const master = getMasterGain();
  if (!ctx || !master) return;

  pegSoundsThisFrame++;

  const t = options.rowIndex / Math.max(1, options.totalRows - 1);
  const baseFreq = 800 + t * 1200;
  const freq = baseFreq * (1 + (Math.random() - 0.5) * 0.10);

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = freq;

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.08, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
  gain.gain.setValueAtTime(0, now + 0.095);

  osc.connect(gain);
  gain.connect(master);

  osc.start(now);
  osc.stop(now + 0.095);

  const cleanup = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch { /* already disconnected */ }
  };

  osc.onended = cleanup;
  setTimeout(cleanup, 200);
}
