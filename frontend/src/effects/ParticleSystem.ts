import { Container, Sprite, Texture, Graphics, Application } from 'pixi.js';
import { getWinTier } from '@/sound/landingSound';

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  active: boolean;
}

interface PendingEmitter {
  x: number;
  y: number;
  remaining: number;
  interval: number;
  nextAt: number;
}

const POOL_SIZE = 200;
const MAX_PENDING_EMITTERS = 10;

const PEG_HIT_COLORS = [0x00e5ff];
const SMALL_WIN_COLORS = [0x00e5ff, 0xffffff];
const BIG_WIN_COLORS = [0x00e5ff, 0xff006e, 0xffd700];
const JACKPOT_COLORS = [0xffd700, 0xffd700, 0xff006e, 0xff006e, 0x00e5ff];

export class ParticleSystem {
  private pool: Particle[] = [];
  private pendingEmitters: PendingEmitter[] = [];
  private container: Container;
  private texture: Texture;
  private degradedCount: number = 0;
  enabled: boolean = true;

  constructor(app: Application, parentContainer: Container) {
    this.container = parentContainer;

    // Create shared 8x8 circle texture
    const g = new Graphics();
    g.circle(4, 4, 4);
    g.fill(0xffffff);
    this.texture = app.renderer.generateTexture(g);
    g.destroy();

    // Pre-allocate pool
    for (let i = 0; i < POOL_SIZE; i++) {
      const sprite = new Sprite(this.texture);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      parentContainer.addChild(sprite);
      this.pool.push({
        sprite,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0,
        active: false,
      });
    }
  }

  /** Set degraded particle count for peg hits (0 = normal, 2 = degraded) */
  setDegradedCount(count: number): void {
    this.degradedCount = count;
  }

  emitPegHit(x: number, y: number): void {
    if (!this.enabled) return;
    const count = this.degradedCount > 0
      ? this.degradedCount
      : 3 + Math.floor(Math.random() * 3); // 3-5
    this.emitBurst(x, y, count, PEG_HIT_COLORS, 0.05, 0.10, 200);
  }

  emitLanding(x: number, y: number, multiplier: number): void {
    if (!this.enabled) return;
    const tier = getWinTier(multiplier);

    switch (tier) {
      case 'loss':
        break;
      case 'small':
        this.emitBurst(x, y, 10, SMALL_WIN_COLORS, 0.08, 0.12, 400);
        break;
      case 'big':
        this.emitBurst(x, y, 30, BIG_WIN_COLORS, 0.1, 0.2, 600);
        break;
      case 'jackpot':
        this.emitBurst(x, y, 80, JACKPOT_COLORS, 0.15, 0.25, 800);
        // Add continuous emitter
        if (this.pendingEmitters.length < MAX_PENDING_EMITTERS) {
          this.pendingEmitters.push({
            x,
            y,
            remaining: 100,
            interval: 50,
            nextAt: performance.now() + 50,
          });
        } else {
          // Drop oldest
          this.pendingEmitters.shift();
          this.pendingEmitters.push({
            x,
            y,
            remaining: 100,
            interval: 50,
            nextAt: performance.now() + 50,
          });
        }
        break;
    }
  }

  tick(dt: number): void {
    // Process pending emitters
    const now = performance.now();
    for (let i = this.pendingEmitters.length - 1; i >= 0; i--) {
      const em = this.pendingEmitters[i];
      if (!this.enabled) {
        this.pendingEmitters.splice(i, 1);
        continue;
      }
      if (now >= em.nextAt) {
        this.emitBurst(em.x, em.y, 5, JACKPOT_COLORS, 0.15, 0.25, 800);
        em.remaining -= 5;
        em.nextAt = now + em.interval;
        if (em.remaining <= 0) {
          this.pendingEmitters.splice(i, 1);
        }
      }
    }

    // Update active particles
    for (const p of this.pool) {
      if (!p.active) continue;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.vy += 0.0003 * dt; // subtle gravity
      p.life -= dt;
      const t = p.life / p.maxLife; // 1→0
      p.sprite.alpha = t;
      p.sprite.scale.set(0.2 + 0.3 * t); // 0.5→0.2
      if (p.life <= 0) this.release(p);
    }
  }

  clear(): void {
    for (const p of this.pool) {
      if (p.active) this.release(p);
    }
    this.pendingEmitters.length = 0;
  }

  destroy(): void {
    this.clear();
    for (const p of this.pool) {
      p.sprite.destroy();
    }
    this.pool.length = 0;
    this.texture.destroy(true);
  }

  private emitBurst(
    x: number,
    y: number,
    count: number,
    colors: number[],
    minSpeed: number,
    maxSpeed: number,
    life: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.acquire();
      if (!p) return;

      const angle = Math.random() * Math.PI * 2;
      const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = life;
      p.maxLife = life;
      p.sprite.x = x;
      p.sprite.y = y;
      p.sprite.tint = colors[Math.floor(Math.random() * colors.length)];
      p.sprite.alpha = 1;
      p.sprite.scale.set(0.5);
    }
  }

  private acquire(): Particle | null {
    // Find first inactive
    for (const p of this.pool) {
      if (!p.active) {
        p.active = true;
        p.sprite.visible = true;
        // Re-add to container in case it was destroyed/recreated
        if (!p.sprite.parent) {
          this.container.addChild(p.sprite);
        }
        return p;
      }
    }
    // Recycle particle with smallest remaining life
    let minLife = Infinity;
    let minP: Particle | null = null;
    for (const p of this.pool) {
      if (p.life < minLife) {
        minLife = p.life;
        minP = p;
      }
    }
    return minP;
  }

  private release(p: Particle): void {
    p.active = false;
    p.sprite.visible = false;
  }

  /** Re-parent all sprites to a new container */
  reparent(newContainer: Container): void {
    this.container = newContainer;
    for (const p of this.pool) {
      if (p.sprite.parent) {
        p.sprite.parent.removeChild(p.sprite);
      }
      newContainer.addChild(p.sprite);
    }
  }
}
