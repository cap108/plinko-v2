import { Container, Sprite, Texture, Application } from 'pixi.js';
import { getSharedTextures } from '@/plinko/textureAtlas';

const TRAIL_LENGTH = 6;
const TRAIL_ALPHAS = [0.30, 0.22, 0.15, 0.10, 0.06, 0.03];
const TRAIL_SCALES = [0.90, 0.78, 0.66, 0.54, 0.42, 0.30]; // taper from near-full to small
const MAX_TRACKED_BALLS = 15;
const MIN_DISTANCE_SQ = 1; // 1px minimum — tight spacing for smooth connected trail

interface BallTrail {
  positions: Array<{ x: number; y: number }>;
  sprites: Sprite[];
}

export class BallTrailSystem {
  private trails: Map<number, BallTrail> = new Map();
  private container: Container;
  private texture: Texture;
  enabled: boolean = true;

  constructor(app: Application, parentContainer: Container) {
    this.container = parentContainer;

    // Use shared texture atlas (WeakMap<Application>)
    this.texture = getSharedTextures(app).circle8;
  }

  updateBall(ballId: number, x: number, y: number, radius: number): void {
    let trail = this.trails.get(ballId);

    if (!trail) {
      // Don't create new trails if disabled or at capacity
      if (!this.enabled || this.trails.size >= MAX_TRACKED_BALLS) return;

      const sprites: Sprite[] = [];
      for (let i = 0; i < TRAIL_LENGTH; i++) {
        const s = new Sprite(this.texture);
        s.anchor.set(0.5);
        s.tint = 0x00e5ff;
        s.visible = false;
        this.container.addChild(s);
        sprites.push(s);
      }

      trail = { positions: [], sprites };
      this.trails.set(ballId, trail);
    }

    // Only record a new trail point if ball has moved enough from the last one
    const last = trail.positions.length > 0 ? trail.positions[trail.positions.length - 1] : null;
    if (!last || (x - last.x) ** 2 + (y - last.y) ** 2 >= MIN_DISTANCE_SQ) {
      trail.positions.push({ x, y });
      if (trail.positions.length > TRAIL_LENGTH + 1) {
        trail.positions.shift();
      }
    }

    // Update sprite positions and visibility (skip i=0 which is under the ball)
    const baseScale = radius / 4; // texture is 8x8 (radius 4), match ball size
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const sprite = trail.sprites[i];
      const posIdx = trail.positions.length - 2 - i; // -2 to skip current position
      if (posIdx >= 0 && this.enabled) {
        const pos = trail.positions[posIdx];
        sprite.position.set(pos.x, pos.y);
        sprite.alpha = TRAIL_ALPHAS[i];
        sprite.scale.set(baseScale * TRAIL_SCALES[i]); // taper down for smooth trail
        sprite.visible = true;
      } else {
        sprite.visible = false;
      }
    }
  }

  removeBall(ballId: number): void {
    const trail = this.trails.get(ballId);
    if (!trail) return;

    for (const s of trail.sprites) {
      if (s.parent) s.parent.removeChild(s);
      s.destroy();
    }
    this.trails.delete(ballId);
  }

  clear(): void {
    for (const [id] of this.trails) {
      this.removeBall(id);
    }
  }

  destroy(): void {
    this.clear();
    // texture owned by shared atlas — do not destroy here
  }

  /** Re-parent all sprites to a new container */
  reparent(newContainer: Container): void {
    this.container = newContainer;
    for (const [, trail] of this.trails) {
      for (const s of trail.sprites) {
        if (s.parent) s.parent.removeChild(s);
        newContainer.addChild(s);
      }
    }
  }
}
