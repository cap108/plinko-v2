import { Container, Sprite, Texture, Graphics, Application } from 'pixi.js';

const TRAIL_LENGTH = 6;
const TRAIL_ALPHAS = [0.35, 0.25, 0.18, 0.12, 0.08, 0.04];
const MAX_TRACKED_BALLS = 15;
const MIN_DISTANCE_SQ = 16; // 4px minimum distance between trail points

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

    // Create shared circle texture (8x8)
    const g = new Graphics();
    g.circle(4, 4, 4);
    g.fill(0xffffff);
    this.texture = app.renderer.generateTexture(g);
    g.destroy();
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
    const scale = (radius * 0.7) / 4; // texture is 8x8, radius 4
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const sprite = trail.sprites[i];
      const posIdx = trail.positions.length - 2 - i; // -2 to skip current position
      if (posIdx >= 0 && this.enabled) {
        const pos = trail.positions[posIdx];
        sprite.position.set(pos.x, pos.y);
        sprite.alpha = TRAIL_ALPHAS[i];
        sprite.scale.set(scale);
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
    this.texture.destroy(true);
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
