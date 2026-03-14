let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;

/** Create the AudioContext and master gain. Call ONLY from a user-gesture handler.
 *  On iOS, we route Web Audio through a MediaStream → <audio> element so that
 *  synthesized sounds bypass the silent/ringer switch (same as background music). */
function createContext(): void {
  if (ctx) return;
  try {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(ctx.destination);

    // iOS silent-mode bypass: pipe Web Audio into an <audio> element.
    // Once an <audio> element is playing a MediaStream from the AudioContext,
    // iOS treats all output from that context as user-initiated media.
    try {
      const dest = ctx.createMediaStreamDestination();
      masterGain.connect(dest);
      const bypass = new Audio();
      bypass.srcObject = dest.stream;
      bypass.volume = 1;
      // play() must happen inside a user gesture (createContext is only called from one)
      void bypass.play().catch(() => {});
    } catch {
      // MediaStreamDestination not supported — SFX will respect silent switch
    }
  } catch {
    ctx = null;
    masterGain = null;
  }
}

/** Returns the shared AudioContext, or null if not yet unlocked by a user gesture. */
export function getAudioContext(): AudioContext | null {
  return ctx;
}

/** Create (if needed) and resume the AudioContext. MUST be called from a user gesture
 *  (touchend / click / keydown). On iOS Safari the context must be both created and
 *  resumed during a gesture — otherwise it stays permanently suspended. */
export function ensureAudioResumed(): void {
  if (!ctx) createContext();
  if (!ctx) return; // creation failed — no Web Audio support

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

// Auto-unlock Web Audio on first user gesture (covers iOS touchend requirement).
// This fires early — before any component-level handlers — to ensure the context
// is created inside a gesture before any physics tick can try to use it.
function unlockOnGesture(): void {
  ensureAudioResumed();
}
if (typeof document !== 'undefined') {
  document.addEventListener('touchstart', unlockOnGesture, { once: true });
  document.addEventListener('touchend', unlockOnGesture, { once: true });
  document.addEventListener('click', unlockOnGesture, { once: true });
}

/** Master gain node (0.3 gain). Returns null if context not yet created. */
export function getMasterGain(): GainNode | null {
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
