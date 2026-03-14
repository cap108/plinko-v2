let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

/** Returns the shared AudioContext, creating it lazily. Returns null on failure. */
export function getAudioContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(ctx.destination);
  } catch {
    ctx = null;
    masterGain = null;
  }
  return ctx;
}

/** Resume the context if suspended. Call from any user-gesture handler. */
export function ensureAudioResumed(): void {
  const c = getAudioContext();
  if (c && c.state === 'suspended') {
    c.resume();
  }
}

/** Master gain node (0.3 gain to prevent clipping). Returns null if no context. */
export function getMasterGain(): GainNode | null {
  if (!masterGain) getAudioContext();
  return masterGain;
}

// ---- Background Music (HTMLAudio, streamed) ----

const STORAGE_BGM_VOLUME = 'plinko_bgm_volume';
const SFX_REF_VOLUME = 0.2;
const BGM_MAX_VOLUME = 0.5 * SFX_REF_VOLUME;

let bgmAudio: HTMLAudioElement | null = null;

export function getBgmVolume(): number {
  try {
    const v = localStorage.getItem(STORAGE_BGM_VOLUME);
    if (v == null) return 0.5;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  } catch { /* ignore */ }
  return 0.5;
}

export function setBgmVolume(sliderValue: number): void {
  const v = Math.max(0, Math.min(1, sliderValue));
  try { localStorage.setItem(STORAGE_BGM_VOLUME, String(v)); } catch { /* ignore */ }
  if (bgmAudio) bgmAudio.volume = v * BGM_MAX_VOLUME;
}

function getBgmAudio(): HTMLAudioElement | null {
  if (bgmAudio) return bgmAudio;
  try {
    const audio = new Audio('/audio/lucky-loop-arcade.mp3');
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = getBgmVolume() * BGM_MAX_VOLUME;
    bgmAudio = audio;
    return bgmAudio;
  } catch {
    return null;
  }
}

/** Start or resume looping background music. */
export function startBackgroundMusic(): void {
  const bgm = getBgmAudio();
  if (!bgm || !bgm.paused) return;
  void bgm.play().catch(() => {});
}

/** Pause background music. */
export function pauseBackgroundMusic(): void {
  if (bgmAudio && !bgmAudio.paused) bgmAudio.pause();
}

/** Set BGM muted state (pause/resume). */
export function setBgmMuted(muted: boolean): void {
  if (muted) {
    pauseBackgroundMusic();
  } else {
    startBackgroundMusic();
  }
}
