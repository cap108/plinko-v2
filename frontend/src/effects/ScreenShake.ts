export class ScreenShake {
  enabled: boolean = true;

  private amplitude: number = 0;
  private duration: number = 0;
  private startTime: number = 0;
  private active: boolean = false;

  trigger(multiplier: number): void {
    if (!this.enabled) return;
    if (multiplier < 5) return;

    const amp = 3 + Math.min(5, Math.log2(multiplier / 5)) * 1.5;
    const dur = 300 + Math.min(300, Math.log2(multiplier / 5) * 75);

    // If already shaking, take larger amplitude and reset timer
    if (this.active && amp < this.amplitude) {
      // Keep the existing larger shake
      return;
    }

    this.amplitude = amp;
    this.duration = dur;
    this.startTime = performance.now();
    this.active = true;
  }

  tick(now: number): { dx: number; dy: number } {
    if (!this.enabled || !this.active) {
      return { dx: 0, dy: 0 };
    }

    const elapsed = now - this.startTime;
    const t = elapsed / this.duration;

    const currentAmp = this.amplitude * Math.exp(-4 * t);

    if (currentAmp < 0.5) {
      this.active = false;
      return { dx: 0, dy: 0 };
    }

    return {
      dx: currentAmp * (Math.random() * 2 - 1),
      dy: currentAmp * (Math.random() * 2 - 1),
    };
  }
}
