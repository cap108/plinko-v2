import { getAudioContext, getMasterGain } from './audioContext';

export type WinTier = 'loss' | 'small' | 'big' | 'jackpot';

export function getWinTier(multiplier: number): WinTier {
  if (multiplier < 1) return 'loss';
  if (multiplier < 5) return 'small';
  if (multiplier < 20) return 'big';
  return 'jackpot';
}

let lastJackpotTime = 0;

/** Play a landing sound based on multiplier tier. No-op if muted/unavailable. */
export function playLandingSound(multiplier: number): void {
  const tier = getWinTier(multiplier);
  if (tier === 'loss') return;

  switch (tier) {
    case 'small':
      playSmallChime();
      break;
    case 'big':
      playBigArpeggio();
      break;
    case 'jackpot': {
      const now = performance.now();
      if (now - lastJackpotTime < 600) return;
      lastJackpotTime = now;
      playJackpotFanfare();
      break;
    }
  }
}

function createVoice(
  ctx: AudioContext,
  master: GainNode,
  freq: number,
  type: OscillatorType,
  startOffset: number,
  duration: number,
  gainValue: number,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.value = freq;

  const start = ctx.currentTime + startOffset;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainValue, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  gain.gain.setValueAtTime(0, start + duration);

  osc.connect(gain);
  gain.connect(master);

  osc.start(start);
  osc.stop(start + duration);

  const cleanup = () => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch { /* already disconnected */ }
  };
  osc.onended = cleanup;
  setTimeout(cleanup, (startOffset + duration) * 1000 + 200);
}

function playSmallChime(): void {
  const ctx = getAudioContext();
  const master = getMasterGain();
  if (!ctx || !master) return;

  createVoice(ctx, master, 523, 'sine', 0, 0.12, 0.08);
  createVoice(ctx, master, 659, 'sine', 0.04, 0.12, 0.08);
}

function playBigArpeggio(): void {
  const ctx = getAudioContext();
  const master = getMasterGain();
  if (!ctx || !master) return;

  createVoice(ctx, master, 523, 'triangle', 0, 0.15, 0.07);
  createVoice(ctx, master, 659, 'triangle', 0.06, 0.15, 0.07);
  createVoice(ctx, master, 784, 'triangle', 0.12, 0.15, 0.07);
}

function playJackpotFanfare(): void {
  const ctx = getAudioContext();
  const master = getMasterGain();
  if (!ctx || !master) return;

  createVoice(ctx, master, 523, 'triangle', 0, 0.4, 0.06);
  createVoice(ctx, master, 659, 'triangle', 0, 0.4, 0.06);
  createVoice(ctx, master, 784, 'triangle', 0, 0.4, 0.06);
  createVoice(ctx, master, 1047, 'triangle', 0.1, 0.4, 0.06);
}
