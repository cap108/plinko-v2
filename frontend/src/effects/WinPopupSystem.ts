import { Container, Text, TextStyle } from 'pixi.js';

const POPUP_POOL_SIZE = 10;
const POPUP_DURATION = 1200;
const FLOAT_DISTANCE = 40;

interface Popup {
  text: Text;
  active: boolean;
  startTime: number;
  startX: number;
  startY: number;
}

function getTierStyle(multiplier: number, alwaysShow: boolean): { fontSize: number; color: number } {
  if (multiplier >= 20) return { fontSize: 22, color: 0xffd700 };
  if (multiplier >= 5) return { fontSize: 16, color: 0xff006e };
  if (multiplier >= 2) return { fontSize: 12, color: 0x00e5ff };
  // Below 2x — only shown in alwaysShow mode (dense slots)
  return { fontSize: alwaysShow ? 14 : 12, color: 0x00e5ff };
}

export class WinPopupSystem {
  private pool: Popup[] = [];
  private container: Container;
  enabled: boolean = true;
  /** When true, show popups for ALL landings (used at 12+ rows where slot text is hidden) */
  alwaysShowPopup: boolean = false;

  constructor(parentContainer: Container) {
    this.container = parentContainer;

    for (let i = 0; i < POPUP_POOL_SIZE; i++) {
      const style = new TextStyle({
        fontFamily: 'Orbitron, system-ui, sans-serif',
        fontSize: 12,
        fontWeight: 'bold',
        fill: 0x00e5ff,
        dropShadow: { color: 0x000000, distance: 1, blur: 2, alpha: 0.5 },
      });
      const text = new Text({ text: '', style });
      text.anchor.set(0.5);
      text.visible = false;
      parentContainer.addChild(text);

      this.pool.push({
        text,
        active: false,
        startTime: 0,
        startX: 0,
        startY: 0,
      });
    }
  }

  show(x: number, y: number, multiplier: number, force = false): void {
    if (!force && !this.enabled) return;
    if (!force && !this.alwaysShowPopup && multiplier < 2) return;

    // Suppression: if 3+ active and multiplier < 5, skip (unless forced or alwaysShow)
    const activeCount = this.pool.filter(p => p.active).length;
    if (!force && !this.alwaysShowPopup && activeCount >= 3 && multiplier < 5) return;

    // Find available popup
    let popup: Popup | null = null;
    for (const p of this.pool) {
      if (!p.active) {
        popup = p;
        break;
      }
    }
    if (!popup) return; // Pool exhausted, skip

    const { fontSize, color } = getTierStyle(multiplier, this.alwaysShowPopup);

    popup.text.text = `${multiplier}x`;
    popup.text.style.fontSize = fontSize;
    popup.text.style.fill = color;
    popup.text.position.set(x, y);
    popup.text.visible = true;
    popup.text.alpha = 1;
    popup.text.scale.set(0);
    popup.active = true;
    popup.startTime = performance.now();
    popup.startX = x;
    popup.startY = y;

    // Re-add to container if needed
    if (!popup.text.parent) {
      this.container.addChild(popup.text);
    }
  }

  tick(now: number): void {
    for (const popup of this.pool) {
      if (!popup.active) continue;

      const elapsed = now - popup.startTime;
      const progress = Math.min(elapsed / POPUP_DURATION, 1);

      // Phase 3: Float upward
      popup.text.y = popup.startY - FLOAT_DISTANCE * progress;
      popup.text.x = popup.startX;

      // Phase 1: Scale overshoot (0-200ms)
      if (elapsed < 200) {
        const t = elapsed / 200;
        const easeOut = 1 - Math.pow(1 - t, 3);
        popup.text.scale.set(1.2 * easeOut);
      }
      // Phase 2: Scale settle (200-400ms)
      else if (elapsed < 400) {
        const t = (elapsed - 200) / 200;
        popup.text.scale.set(1.2 - 0.2 * t);
      } else {
        popup.text.scale.set(1.0);
      }

      // Phase 4: Fade (800-1200ms)
      if (elapsed >= 800) {
        const fadeT = (elapsed - 800) / 400;
        popup.text.alpha = 1 - fadeT;
      } else {
        popup.text.alpha = 1;
      }

      // Complete
      if (progress >= 1) {
        popup.active = false;
        popup.text.visible = false;
      }
    }
  }

  clear(): void {
    for (const popup of this.pool) {
      popup.active = false;
      popup.text.visible = false;
    }
  }

  destroy(): void {
    for (const popup of this.pool) {
      popup.text.destroy();
    }
    this.pool.length = 0;
  }

  /** Re-parent all text objects to a new container */
  reparent(newContainer: Container): void {
    this.container = newContainer;
    for (const popup of this.pool) {
      if (popup.text.parent) popup.text.parent.removeChild(popup.text);
      newContainer.addChild(popup.text);
    }
  }
}
