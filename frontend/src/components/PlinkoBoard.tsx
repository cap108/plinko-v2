import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
} from 'pixi.js';
import type { RowCount } from '@plinko-v2/shared';
import {
  BOARD_WIDTH,
  PEG_RADIUS,
  SLOT_ROW_HEIGHT,
  ANCHOR_LABEL_HEIGHT,
  getPegPositions,
  getSlotXBounds,
  getSlotY,
  getSlotBottom,
  getBoardHeight,
  getBallRadiusForRows,
} from '@/plinko/boardLayout';
import { simulateAsync, terminateWorker } from '@/plinko/physicsWorkerClient';
import {
  createBallPlayback,
  tickBall,
  type BallPlayback,
  type SpeedPreset,
} from '@/plinko/playback';
import { EffectCoordinator } from '@/effects/EffectCoordinator';
import { getSharedTextures, destroySharedTextures } from '@/plinko/textureAtlas';

const SLOT_COLORS = {
  jackpot: 0xffd700, // gold — edge slots (highest multiplier)
  high: 0xff006e, // magenta
  mid: 0x9b59b6, // purple
  low: 0x2563eb, // blue — center slots (lowest multiplier)
};

function getSlotColor(slotIndex: number, totalSlots: number): number {
  const center = (totalSlots - 1) / 2;
  const distFromCenter = Math.abs(slotIndex - center) / center; // 0..1
  if (distFromCenter > 0.85) return SLOT_COLORS.jackpot;
  if (distFromCenter > 0.6) return SLOT_COLORS.high;
  if (distFromCenter > 0.3) return SLOT_COLORS.mid;
  return SLOT_COLORS.low;
}

interface PegGlow {
  poolIndex: number; // index into glowPool
  globalIndex: number; // peg index
  startTime: number;
}

const PEG_GLOW_DURATION = 300; // ms
const PEG_BASE_COLOR = 0xc0c0d0;

const BALL_POOL_SIZE = 25;
const GLOW_POOL_SIZE = 30;

export interface PlinkoBoardProps {
  rows: RowCount;
  speed: SpeedPreset;
  multipliers?: number[];
  onBallLanded?: (dropId: number, slotIndex: number) => void;
  onBallCountChange?: (count: number) => void;
  reducedMotion?: boolean;
  muted?: boolean;
}

export interface PlinkoBoardHandle {
  dropBall: (slotIndex: number) => number;
  getBallCount: () => number;
}

function formatMultiplier(m: number, compact = false): string {
  if (compact) {
    if (m >= 1000) return `${(m / 1000).toFixed(0)}K`;
    if (m >= 100) return `${Math.round(m)}`;
    if (m >= 10) return `${m.toFixed(0)}`;
    if (m >= 1) return `${m.toFixed(1)}`;
    return `${m.toFixed(1)}`;
  }
  if (m >= 1000) return `${(m / 1000).toFixed(0)}K`;
  if (m >= 100) return `${Math.round(m)}x`;
  if (m >= 10) return `${m.toFixed(0)}x`;
  return `${m.toFixed(1)}x`;
}

const PlinkoBoard = forwardRef<PlinkoBoardHandle, PlinkoBoardProps>(
  function PlinkoBoard({ rows, speed, multipliers, onBallLanded, onBallCountChange, reducedMotion, muted }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);

    const ballsRef = useRef<BallPlayback[]>([]);
    const pegGlowsRef = useRef<PegGlow[]>([]);
    const pegLayerRef = useRef<Container | null>(null);
    const ballLayerRef = useRef<Container | null>(null);
    const slotLayerRef = useRef<Container | null>(null);
    const pegGraphicsRef = useRef<Graphics[]>([]);
    const slotTextsRef = useRef<Text[]>([]);
    const anchorTextsRef = useRef<{ text: Text; slotIndex: number }[]>([]);
    const coordinatorRef = useRef<EffectCoordinator | null>(null);
    const effectLayerRef = useRef<Container | null>(null);
    const glowLayerRef = useRef<Container | null>(null);

    // Ball sprite pool
    const ballPoolRef = useRef<Sprite[]>([]);
    const ballPoolUsedRef = useRef<Map<number, Sprite>>(new Map()); // ballId → sprite

    // Glow sprite pool
    const glowPoolRef = useRef<Sprite[]>([]);
    const glowPoolFreeRef = useRef<number[]>([]); // indices of free glow sprites

    const rowsRef = useRef(rows);
    const speedRef = useRef(speed);
    const multipliersRef = useRef(multipliers);
    const onBallLandedRef = useRef(onBallLanded);
    const onBallCountChangeRef = useRef(onBallCountChange);
    const reducedMotionRef = useRef(reducedMotion);
    const mutedRef = useRef(muted);
    rowsRef.current = rows;
    speedRef.current = speed;
    multipliersRef.current = multipliers;
    onBallLandedRef.current = onBallLanded;
    onBallCountChangeRef.current = onBallCountChange;
    reducedMotionRef.current = reducedMotion;
    mutedRef.current = muted;

    const buildBoard = useCallback((app: Application, rowCount: RowCount) => {
      // Clear coordinator sprites from old containers before destruction
      coordinatorRef.current?.clearAll();

      // Detach pooled ball sprites before destroying layers
      for (const sprite of ballPoolRef.current) {
        if (sprite.parent) sprite.parent.removeChild(sprite);
        sprite.visible = false;
      }
      ballPoolUsedRef.current.clear();

      // Detach pooled glow sprites
      for (const sprite of glowPoolRef.current) {
        if (sprite.parent) sprite.parent.removeChild(sprite);
        sprite.visible = false;
      }
      glowPoolFreeRef.current = Array.from({ length: glowPoolRef.current.length }, (_, i) => i);

      // Destroy old containers — peg/slot own their children;
      // ball/effect children were detached above
      for (const lRef of [pegLayerRef, slotLayerRef]) {
        if (lRef.current) {
          app.stage.removeChild(lRef.current);
          lRef.current.destroy({ children: true });
        }
      }
      for (const lRef of [ballLayerRef, effectLayerRef, glowLayerRef]) {
        if (lRef.current) {
          lRef.current.removeChildren();
          app.stage.removeChild(lRef.current);
          lRef.current.destroy();
        }
      }

      const pegLayer = new Container();
      const glowLayer = new Container();
      const ballLayer = new Container();
      const slotLayer = new Container();
      const effectLayer = new Container();

      pegLayerRef.current = pegLayer;
      glowLayerRef.current = glowLayer;
      ballLayerRef.current = ballLayer;
      slotLayerRef.current = slotLayer;
      effectLayerRef.current = effectLayer;

      // Scale the logical board to fill the renderer
      const boardH = getBoardHeight(rowCount);
      const scaleX = app.screen.width / BOARD_WIDTH;
      const scaleY = app.screen.height / boardH;
      const scale = Math.min(scaleX, scaleY);
      const offsetX = (app.screen.width - BOARD_WIDTH * scale) / 2;
      const isMobile = app.screen.width < 1024;
      const offsetY = isMobile ? 0 : (app.screen.height - boardH * scale) / 2;

      const textRes = Math.ceil(scale * (window.devicePixelRatio ?? 1));

      for (const layer of [pegLayer, glowLayer, ballLayer, slotLayer, effectLayer]) {
        layer.scale.set(scale);
        layer.position.set(offsetX, offsetY);
      }

      // ---- Pegs ----
      const pegs = getPegPositions(rowCount);
      pegGraphicsRef.current = pegs.map((peg) => {
        const g = new Graphics();
        g.circle(0, 0, PEG_RADIUS);
        g.fill(PEG_BASE_COLOR);
        g.position.set(peg.x, peg.y);
        pegLayer.addChild(g);
        return g;
      });

      // Cache peg layer as static texture (false = static snapshot, no live updates)
      pegLayer.cacheAsTexture(false);

      // ---- Slot labels ----
      const totalSlots = rowCount + 1;
      const slotYPos = getSlotY(rowCount);
      const denseSlots = rowCount >= 12;
      slotTextsRef.current = [];
      anchorTextsRef.current = [];

      const centerSlot = Math.floor(totalSlots / 2);
      const anchorSlots = new Set([0, totalSlots - 1, centerSlot]);
      if (totalSlots % 2 === 0) anchorSlots.add(centerSlot - 1);

      for (let s = 0; s < totalSlots; s++) {
        const bounds = getSlotXBounds(rowCount, s);
        const cx = (bounds.left + bounds.right) / 2;
        const color = getSlotColor(s, totalSlots);

        const bg = new Graphics();
        const slotW = bounds.right - bounds.left;
        const slotHalfH = SLOT_ROW_HEIGHT / 2;
        bg.roundRect(bounds.left + 1, slotYPos - slotHalfH, slotW - 2, SLOT_ROW_HEIGHT, 4);
        bg.fill({ color, alpha: 0.25 });
        slotLayer.addChild(bg);

        if (denseSlots) {
          bg.eventMode = 'static';
          bg.cursor = 'pointer';
          const slotIndex = s;
          const showLabel = () => {
            const mult = multipliersRef.current?.[slotIndex];
            if (mult != null) {
              coordinatorRef.current?.showSlotLabel(cx, slotYPos - slotHalfH, mult, color);
            }
          };
          bg.on('pointertap', showLabel);
          bg.on('mouseover', showLabel);
        }

        const multipliersArr = multipliersRef.current;

        if (!denseSlots) {
          const useCompact = rows >= 14;
          const label = multipliersArr?.[s] != null
            ? formatMultiplier(multipliersArr[s], useCompact)
            : String(s);
          const style = new TextStyle({
            fontFamily: 'Orbitron, system-ui, sans-serif',
            fontSize: useCompact ? Math.min(9, slotW * 0.48) : Math.min(10, slotW * 0.35),
            fontWeight: 'bold',
            fill: color,
          });
          const text = new Text({ text: label, style, resolution: textRes });
          text.anchor.set(0.5);
          text.position.set(cx, slotYPos);
          slotLayer.addChild(text);
          slotTextsRef.current.push(text);
        }

        if (denseSlots && anchorSlots.has(s)) {
          const label = multipliersArr?.[s] != null
            ? formatMultiplier(multipliersArr[s], false)
            : String(s);
          const anchorY = getSlotBottom(rowCount) + ANCHOR_LABEL_HEIGHT / 2 + 2;
          const style = new TextStyle({
            fontFamily: 'Orbitron, system-ui, sans-serif',
            fontSize: 9,
            fontWeight: 'bold',
            fill: color,
          });
          const text = new Text({ text: label, style, resolution: textRes });
          text.anchor.set(0.5);
          text.position.set(cx, anchorY);
          slotLayer.addChild(text);
          anchorTextsRef.current.push({ text, slotIndex: s });
        }
      }

      // Add layers: pegs (back), glow, balls, slots, effects (front)
      app.stage.addChild(pegLayer);
      app.stage.addChild(glowLayer);
      app.stage.addChild(ballLayer);
      app.stage.addChild(slotLayer);
      app.stage.addChild(effectLayer);

      // Re-parent pooled ball sprites into new ballLayer
      for (const sprite of ballPoolRef.current) {
        ballLayer.addChild(sprite);
      }

      // Re-parent pooled glow sprites into new glowLayer
      for (const sprite of glowPoolRef.current) {
        glowLayer.addChild(sprite);
      }

      // Notify coordinator to clear stale state and re-parent
      coordinatorRef.current?.reconfigure(scale, offsetX, offsetY);
    }, []);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let destroyed = false;
      let rafId = 0;
      let lastTickTime = 0;

      (async () => {
        const app = new Application();
        await app.init({
          background: 0x0a0e1a,
          resizeTo: container,
          antialias: true,
          resolution: window.devicePixelRatio ?? 1,
          autoDensity: true,
        });

        if (destroyed) {
          app.destroy({ removeView: true }, { children: true });
          return;
        }

        container.appendChild(app.canvas);
        appRef.current = app;

        // Initialize shared textures
        const { circle } = getSharedTextures(app);

        // Initialize ball sprite pool
        const ballPool: Sprite[] = [];
        for (let i = 0; i < BALL_POOL_SIZE; i++) {
          const sprite = new Sprite(circle);
          sprite.anchor.set(0.5);
          sprite.tint = 0x00e5ff;
          sprite.visible = false;
          ballPool.push(sprite);
        }
        ballPoolRef.current = ballPool;

        // Initialize glow sprite pool
        const glowPool: Sprite[] = [];
        for (let i = 0; i < GLOW_POOL_SIZE; i++) {
          const sprite = new Sprite(circle);
          sprite.anchor.set(0.5);
          sprite.tint = 0x00e5ff;
          sprite.blendMode = 'add';
          sprite.visible = false;
          glowPool.push(sprite);
        }
        glowPoolRef.current = glowPool;
        glowPoolFreeRef.current = Array.from({ length: GLOW_POOL_SIZE }, (_, i) => i);

        // Build initial board (will re-parent pool sprites)
        buildBoard(app, rowsRef.current);

        const coordinator = new EffectCoordinator({
          app,
          effectLayerRef,
          ballLayerRef,
        });
        coordinatorRef.current = coordinator;

        lastTickTime = performance.now();

        const onResize = () => {
          // Return all ball sprites to pool
          for (const [, sprite] of ballPoolUsedRef.current) {
            sprite.visible = false;
          }
          ballPoolUsedRef.current.clear();
          ballsRef.current = [];
          pegGlowsRef.current = [];
          // Return all glow sprites to pool
          for (const sprite of glowPoolRef.current) {
            sprite.visible = false;
          }
          glowPoolFreeRef.current = Array.from({ length: glowPoolRef.current.length }, (_, i) => i);
          buildBoard(app, rowsRef.current);
          onBallCountChangeRef.current?.(0);
        };
        app.renderer.on('resize', onResize);

        const tick = () => {
          if (destroyed) return;
          const now = performance.now();
          const dt = Math.min(now - lastTickTime, 33);
          lastTickTime = now;

          const balls = ballsRef.current;
          const pegs = pegGraphicsRef.current;
          const glows = pegGlowsRef.current;
          const coord = coordinatorRef.current;

          if (coord) {
            coord.reducedMotion = reducedMotionRef.current ?? false;
            coord.muted = mutedRef.current ?? true;
            coord.activeBallCount = balls.filter(b => !b.landed).length;
            coord.denseSlots = rowsRef.current >= 12;
          }

          const ballRadius = getBallRadiusForRows(rowsRef.current);
          const spriteScale = ballRadius / 16; // texture is 32x32, radius 16

          let countChanged = false;
          for (let i = balls.length - 1; i >= 0; i--) {
            const ball = balls[i];
            const update = tickBall(ball, now);

            if (!update) {
              coord?.handleEvent({ type: 'ballRemoved', ballId: ball.id });
              // Return sprite to pool
              const sprite = ballPoolUsedRef.current.get(ball.id);
              if (sprite) {
                sprite.visible = false;
                ballPoolUsedRef.current.delete(ball.id);
              }
              balls.splice(i, 1);
              countChanged = true;
              continue;
            }

            let sprite = ballPoolUsedRef.current.get(ball.id);
            if (!sprite) {
              // Acquire from pool — find first invisible sprite
              sprite = ballPool.find(s => !s.visible);
              if (sprite) {
                sprite.visible = true;
                sprite.scale.set(spriteScale);
                ballPoolUsedRef.current.set(ball.id, sprite);
              }
            }
            if (sprite) {
              sprite.position.set(update.pos.x, update.pos.y);
              sprite.alpha = update.alpha;
            }

            for (const hit of update.newPegHits) {
              // Acquire a glow sprite from pool
              const freeIdx = glowPoolFreeRef.current.pop();
              if (freeIdx !== undefined) {
                glows.push({ poolIndex: freeIdx, globalIndex: hit.globalIndex, startTime: now });
                const glowSprite = glowPool[freeIdx];
                const peg = pegs[hit.globalIndex];
                if (peg && glowSprite) {
                  glowSprite.position.set(peg.position.x, peg.position.y);
                  glowSprite.visible = true;
                  glowSprite.alpha = 1;
                  glowSprite.scale.set(PEG_RADIUS * 2.0 / 16);
                }
              }
              const peg = pegs[hit.globalIndex];
              if (peg) {
                coord?.handleEvent({
                  type: 'pegHit',
                  rowIndex: hit.rowIndex,
                  totalRows: rowsRef.current,
                  x: peg.position.x,
                  y: peg.position.y,
                });
              }
            }

            coord?.handleEvent({
              type: 'ballMoved',
              ballId: ball.id,
              x: update.pos.x,
              y: update.pos.y,
              radius: ballRadius,
            });

            if (update.justLanded) {
              const mult = multipliersRef.current?.[ball.slotIndex] ?? 1;
              const totalSlots = rowsRef.current + 1;
              coord?.handleEvent({
                type: 'ballLanded',
                x: update.pos.x,
                y: update.pos.y,
                multiplier: mult,
                slotColor: getSlotColor(ball.slotIndex, totalSlots),
              });
              onBallLandedRef.current?.(ball.dropId, ball.slotIndex);
              countChanged = true;
            }
          }

          if (countChanged) {
            onBallCountChangeRef.current?.(balls.length);
          }

          // Update glow sprites (alpha/scale — cheap, no throttle needed)
          for (let i = glows.length - 1; i >= 0; i--) {
            const glow = glows[i];
            const elapsed = now - glow.startTime;
            if (elapsed >= PEG_GLOW_DURATION) {
              // Return glow sprite to pool
              const glowSprite = glowPool[glow.poolIndex];
              if (glowSprite) glowSprite.visible = false;
              glowPoolFreeRef.current.push(glow.poolIndex);
              glows.splice(i, 1);
              continue;
            }
            const t = 1 - elapsed / PEG_GLOW_DURATION;
            const glowSprite = glowPool[glow.poolIndex];
            if (glowSprite) {
              glowSprite.alpha = t;
              glowSprite.scale.set((PEG_RADIUS * (1 + t)) / 16);
            }
          }

          coord?.tick(now, dt);

          rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
      })();

      return () => {
        destroyed = true;
        cancelAnimationFrame(rafId);
        // Cleanup order: pool sprites → glow sprites → coordinator → shared textures → worker → app
        for (const sprite of ballPoolRef.current) {
          sprite.destroy();
        }
        ballPoolRef.current = [];
        ballPoolUsedRef.current.clear();
        for (const sprite of glowPoolRef.current) {
          sprite.destroy();
        }
        glowPoolRef.current = [];
        glowPoolFreeRef.current = [];
        coordinatorRef.current?.destroy();
        coordinatorRef.current = null;
        if (appRef.current) {
          destroySharedTextures(appRef.current);
        }
        terminateWorker();
        if (appRef.current) {
          appRef.current.destroy({ removeView: true }, { children: true });
          appRef.current = null;
        }
        ballsRef.current = [];
        pegGlowsRef.current = [];
      };
    }, []);

    useEffect(() => {
      const app = appRef.current;
      if (app) {
        // Return all ball sprites to pool
        for (const [, sprite] of ballPoolUsedRef.current) {
          sprite.visible = false;
        }
        ballPoolUsedRef.current.clear();
        ballsRef.current = [];
        pegGlowsRef.current = [];
        // Return all glow sprites to pool
        for (const sprite of glowPoolRef.current) {
          sprite.visible = false;
        }
        glowPoolFreeRef.current = Array.from({ length: glowPoolRef.current.length }, (_, i) => i);

        buildBoard(app, rows);
        onBallCountChangeRef.current?.(0);
      }
    }, [rows, buildBoard]);

    useEffect(() => {
      multipliersRef.current = multipliers;
      if (!multipliers) return;
      const useCompact = rows >= 14;
      multipliers.forEach((m, idx) => {
        const text = slotTextsRef.current?.[idx];
        if (text) text.text = formatMultiplier(m, useCompact);
      });
      anchorTextsRef.current?.forEach(({ text, slotIndex }) => {
        const m = multipliers[slotIndex];
        if (m != null) text.text = formatMultiplier(m, false);
      });
    }, [multipliers, rows]);

    let nextDropId = 1;

    const dropBall = useCallback(
      (slotIndex: number): number => {
        const dropId = nextDropId++;
        const currentRows = rowsRef.current;
        const currentSpeed = speedRef.current;

        simulateAsync(currentRows, slotIndex).then((result) => {
          const bp = createBallPlayback(result, currentSpeed, performance.now());
          bp.dropId = dropId;
          ballsRef.current.push(bp);
          onBallCountChangeRef.current?.(ballsRef.current.length);
        }).catch((err) => {
          console.error('Ball simulation failed:', err);
        });
        return dropId;
      },
      [],
    );

    useImperativeHandle(ref, () => ({
      dropBall,
      getBallCount: () => ballsRef.current.length,
    }), [dropBall]);

    return (
      <div
        ref={containerRef}
        id="plinko-board"
        className="w-full h-full"
        role="region"
        aria-label="Plinko game board"
      />
    );
  },
);

export default PlinkoBoard;
