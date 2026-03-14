import type { Container, Application } from 'pixi.js';
import type { EffectEvent } from './effectEvents';
import { ParticleSystem } from './ParticleSystem';
import { ScreenShake } from './ScreenShake';
import { BallTrailSystem } from './BallTrailSystem';
import { BOARD_WIDTH } from '@/plinko/boardLayout';
import { WinPopupSystem } from './WinPopupSystem';
import { playPegSound, resetPegSoundThrottle } from '@/sound/pegSound';
import { playLandingSound } from '@/sound/landingSound';

function triggerHaptic(multiplier: number, reducedMotion: boolean): void {
  if (reducedMotion || multiplier < 5 || !navigator.vibrate) return;
  if (multiplier >= 50) {
    navigator.vibrate([40, 30, 60, 30, 80]); // jackpot burst pattern
  } else if (multiplier >= 10) {
    navigator.vibrate([30, 20, 50]); // big win double tap
  } else {
    navigator.vibrate(40); // single short pulse
  }
}

export interface EffectCoordinatorConfig {
  app: Application;
  effectLayerRef: { current: Container | null };
  ballLayerRef: { current: Container | null };
}

export class EffectCoordinator {
  private particles: ParticleSystem | null = null;
  private shake: ScreenShake;
  private trails: BallTrailSystem | null = null;
  private popups: WinPopupSystem | null = null;
  private app: Application;
  private effectLayerRef: { current: Container | null };
  private ballLayerRef: { current: Container | null };

  reducedMotion: boolean = false;
  muted: boolean = true;
  activeBallCount: number = 0;
  /** Set to true at 12+ rows so landing popups show for every ball */
  denseSlots: boolean = false;

  constructor(config: EffectCoordinatorConfig) {
    this.app = config.app;
    this.effectLayerRef = config.effectLayerRef;
    this.ballLayerRef = config.ballLayerRef;
    this.shake = new ScreenShake();
  }

  private ensureSubsystems(): void {
    const effectLayer = this.effectLayerRef.current;
    const ballLayer = this.ballLayerRef.current;

    if (!this.particles && effectLayer) {
      this.particles = new ParticleSystem(this.app, effectLayer);
    }
    if (!this.trails && ballLayer) {
      this.trails = new BallTrailSystem(this.app, ballLayer);
    }
    if (!this.popups && effectLayer) {
      this.popups = new WinPopupSystem(effectLayer);
      this.popups.canvasWidth = BOARD_WIDTH;
    }
  }

  handleEvent(event: EffectEvent): void {
    this.ensureSubsystems();

    switch (event.type) {
      case 'pegHit':
        if (!this.muted && this.activeBallCount <= 50) {
          playPegSound(event);
        }
        if (this.activeBallCount <= 50) {
          if (this.activeBallCount > 20) {
            this.particles?.setDegradedCount(2);
          } else {
            this.particles?.setDegradedCount(0);
          }
          this.particles?.emitPegHit(event.x, event.y);
        }
        break;

      case 'ballMoved':
        this.trails?.updateBall(event.ballId, event.x, event.y, event.radius);
        break;

      case 'ballLanded': {
        if (!this.muted) playLandingSound(event.multiplier);
        this.particles?.emitLanding(event.x, event.y, event.multiplier);
        this.shake.trigger(event.multiplier);
        triggerHaptic(event.multiplier, this.reducedMotion);
        if (this.denseSlots || event.multiplier >= 2) {
          // Win popup suppression at >20 balls: suppress below 5x (unless dense mode)
          if (!this.denseSlots && this.activeBallCount > 20 && event.multiplier < 5) break;
          this.popups?.show(event.x, event.y, event.multiplier);
        }
        break;
      }

      case 'ballRemoved':
        this.trails?.removeBall(event.ballId);
        break;
    }
  }

  tick(now: number, dt: number): void {
    resetPegSoundThrottle();
    this.ensureSubsystems();

    // Update reduced motion flags
    if (this.particles) this.particles.enabled = !this.reducedMotion;
    this.shake.enabled = !this.reducedMotion;
    if (this.popups) {
      this.popups.enabled = !this.reducedMotion;
      this.popups.alwaysShowPopup = this.denseSlots;
    }

    // Trail hysteresis: off at >12, on at <8
    if (this.trails) {
      if (this.activeBallCount > 12) {
        this.trails.enabled = false;
      } else if (this.activeBallCount < 8) {
        this.trails.enabled = !this.reducedMotion;
      }
    }

    // Tick subsystems
    this.particles?.tick(dt);
    this.popups?.tick(now);

    // Screen shake → apply to stage
    const { dx, dy } = this.shake.tick(now);
    this.app.stage.position.set(dx, dy);
  }

  /** Show a multiplier label popup without triggering sound/particles (for slot taps). */
  showSlotLabel(x: number, y: number, multiplier: number): void {
    this.ensureSubsystems();
    this.popups?.show(x, y, multiplier, true);
  }

  /** Clear active effects and detach sprites from containers (before container destruction). */
  clearAll(): void {
    this.particles?.clear();
    this.trails?.clear();
    this.popups?.clear();
  }

  /** Re-parent subsystem sprites to the current container refs. Call after buildBoard(). */
  reconfigure(_scale: number, _offsetX: number, _offsetY: number): void {
    const effectLayer = this.effectLayerRef.current;
    const ballLayer = this.ballLayerRef.current;

    if (effectLayer && this.particles) {
      this.particles.reparent(effectLayer);
    }
    if (ballLayer && this.trails) {
      this.trails.reparent(ballLayer);
    }
    if (effectLayer && this.popups) {
      this.popups.reparent(effectLayer);
      this.popups.canvasWidth = BOARD_WIDTH;
    }
  }

  destroy(): void {
    this.particles?.destroy();
    this.trails?.destroy();
    this.popups?.destroy();
    this.particles = null;
    this.trails = null;
    this.popups = null;
  }
}
