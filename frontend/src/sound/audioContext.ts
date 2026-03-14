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

/** Resume the context if suspended, or create it fresh during a user gesture.
 *  On iOS Safari the AudioContext MUST be created during a user gesture
 *  (touchend / click / keydown) — otherwise it may be permanently suspended. */
export function ensureAudioResumed(): void {
  // If no context exists yet, create it now (inside a user gesture)
  if (!ctx) {
    getAudioContext();
  }
  if (!ctx) return; // creation failed — no Web Audio support

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }

  // iOS edge case: if the context was created outside a gesture and .resume()
  // didn't work, close the stale context so the next gesture creates a fresh one.
  if (ctx.state === 'suspended') {
    const staleCtx = ctx;
    setTimeout(() => {
      if (staleCtx.state === 'suspended') {
        try { staleCtx.close(); } catch { /* ignore */ }
        ctx = null;
        masterGain = null;
      }
    }, 200);
  }
}

// Auto-unlock Web Audio on first user gesture (covers iOS touchend requirement)
function unlockOnGesture(): void {
  ensureAudioResumed();
  document.removeEventListener('touchend', unlockOnGesture);
  document.removeEventListener('click', unlockOnGesture);
}
if (typeof document !== 'undefined') {
  document.addEventListener('touchend', unlockOnGesture, { once: true });
  document.addEventListener('click', unlockOnGesture, { once: true });
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
