import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  Application,
  Container,
  Graphics,
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
  globalIndex: number;
  startTime: number;
}

const PEG_GLOW_DURATION = 300; // ms
const PEG_BASE_COLOR = 0xc0c0d0;
const PEG_GLOW_COLOR = 0x00e5ff;
const PEG_GLOW_SCALE = 2.0;

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
    // Compact format for high row counts (14+): drop "x" suffix, tighter numbers
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
    const dirtyPegsRef = useRef<Set<number>>(new Set());
    const pegLayerRef = useRef<Container | null>(null);
    const ballLayerRef = useRef<Container | null>(null);
    const slotLayerRef = useRef<Container | null>(null);
    const pegGraphicsRef = useRef<Graphics[]>([]);
    const ballGraphicsRef = useRef<Map<number, Graphics>>(new Map());
    const slotTextsRef = useRef<Text[]>([]);
    const coordinatorRef = useRef<EffectCoordinator | null>(null);
    const effectLayerRef = useRef<Container | null>(null);
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

      // Destroy old containers — peg/slot own their children;
      // ball/effect children were detached by clearAll() above
      for (const ref of [pegLayerRef, slotLayerRef]) {
        if (ref.current) {
          app.stage.removeChild(ref.current);
          ref.current.destroy({ children: true });
        }
      }
      for (const ref of [ballLayerRef, effectLayerRef]) {
        if (ref.current) {
          ref.current.removeChildren();
          app.stage.removeChild(ref.current);
          ref.current.destroy();
        }
      }

      const pegLayer = new Container();
      const ballLayer = new Container();
      const slotLayer = new Container();
      const effectLayer = new Container();

      pegLayerRef.current = pegLayer;
      ballLayerRef.current = ballLayer;
      slotLayerRef.current = slotLayer;
      effectLayerRef.current = effectLayer;

      // Scale the logical board to fill the renderer
      const boardH = getBoardHeight(rowCount);
      const scaleX = app.screen.width / BOARD_WIDTH;
      const scaleY = app.screen.height / boardH;
      const scale = Math.min(scaleX, scaleY);
      const offsetX = (app.screen.width - BOARD_WIDTH * scale) / 2;
      // Top-align on narrow screens (mobile), center on wide screens (desktop)
      const isMobile = app.screen.width < 768;
      const offsetY = isMobile ? 0 : (app.screen.height - boardH * scale) / 2;

      for (const layer of [pegLayer, ballLayer, slotLayer, effectLayer]) {
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

      // ---- Slot labels ----
      const totalSlots = rowCount + 1;
      const slotYPos = getSlotY(rowCount);
      const denseSlots = rowCount >= 12; // hide in-slot text, show anchor labels instead
      slotTextsRef.current = [];

      // Determine which slots get anchor labels (edges + center)
      const centerSlot = Math.floor(totalSlots / 2);
      const anchorSlots = new Set([0, totalSlots - 1, centerSlot]);
      // For even slot counts, include both center-adjacent slots
      if (totalSlots % 2 === 0) anchorSlots.add(centerSlot - 1);

      for (let s = 0; s < totalSlots; s++) {
        const bounds = getSlotXBounds(rowCount, s);
        const cx = (bounds.left + bounds.right) / 2;
        const color = getSlotColor(s, totalSlots);

        // Slot background
        const bg = new Graphics();
        const slotW = bounds.right - bounds.left;
        const slotHalfH = SLOT_ROW_HEIGHT / 2;
        bg.roundRect(bounds.left + 1, slotYPos - slotHalfH, slotW - 2, SLOT_ROW_HEIGHT, 4);
        bg.fill({ color, alpha: 0.25 });
        slotLayer.addChild(bg);

        // Tap (mobile) / hover (desktop) to reveal multiplier (dense mode only)
        if (denseSlots) {
          bg.eventMode = 'static';
          bg.cursor = 'pointer';
          const slotIndex = s;
          const showLabel = () => {
            const mult = multipliersRef.current?.[slotIndex];
            if (mult != null) {
              coordinatorRef.current?.showSlotLabel(cx, slotYPos - slotHalfH, mult);
            }
          };
          bg.on('pointertap', showLabel);
          bg.on('mouseover', showLabel); // mouse only — avoids double-fire on touch
        }

        const multipliersArr = multipliersRef.current;

        if (!denseSlots) {
          // Normal mode: show multiplier inside each slot
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
          const text = new Text({ text: label, style });
          text.anchor.set(0.5);
          text.position.set(cx, slotYPos);
          slotLayer.addChild(text);
          slotTextsRef.current.push(text);
        }

        // Dense mode: anchor labels below edge and center slots
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
          const text = new Text({ text: label, style });
          text.anchor.set(0.5);
          text.position.set(cx, anchorY);
          slotLayer.addChild(text);
        }
      }

      // Add layers in order: pegs (back), balls (middle), slots, effects (front)
      app.stage.addChild(pegLayer);
      app.stage.addChild(ballLayer);
      app.stage.addChild(slotLayer);
      app.stage.addChild(effectLayer);

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

        // Build initial board
        buildBoard(app, rowsRef.current);

        const coordinator = new EffectCoordinator({
          app,
          effectLayerRef,
          ballLayerRef,
        });
        coordinatorRef.current = coordinator;

        lastTickTime = performance.now();

        const onResize = () => {
          buildBoard(app, rowsRef.current);
        };
        app.renderer.on('resize', onResize);

        const tick = () => {
          if (destroyed) return;
          const now = performance.now();
          const dt = Math.min(now - lastTickTime, 33); // cap at ~30fps worth
          lastTickTime = now;

          const balls = ballsRef.current;
          const ballGfx = ballGraphicsRef.current;
          const ballLayer = ballLayerRef.current;
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

          let countChanged = false;
          for (let i = balls.length - 1; i >= 0; i--) {
            const ball = balls[i];
            const update = tickBall(ball, now);

            if (!update) {
              coord?.handleEvent({ type: 'ballRemoved', ballId: ball.id });
              const g = ballGfx.get(ball.id);
              if (g && ballLayer) {
                ballLayer.removeChild(g);
                g.destroy();
                ballGfx.delete(ball.id);
              }
              balls.splice(i, 1);
              countChanged = true;
              continue;
            }

            let g = ballGfx.get(ball.id);
            if (!g && ballLayer) {
              g = new Graphics();
              g.circle(0, 0, ballRadius);
              g.fill(0x00e5ff);
              ballLayer.addChild(g);
              ballGfx.set(ball.id, g);
            }
            if (g) {
              g.position.set(update.pos.x, update.pos.y);
              g.alpha = update.alpha;
            }

            for (const hit of update.newPegHits) {
              glows.push({ globalIndex: hit.globalIndex, startTime: now });
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
              coord?.handleEvent({
                type: 'ballLanded',
                x: update.pos.x,
                y: update.pos.y,
                multiplier: mult,
              });
              onBallLandedRef.current?.(ball.dropId, ball.slotIndex);
              countChanged = true;
            }
          }

          if (countChanged) {
            onBallCountChangeRef.current?.(balls.length);
          }

          const dirty = dirtyPegsRef.current;
          for (const idx of dirty) {
            const pg = pegs[idx];
            if (pg) {
              pg.clear();
              pg.circle(0, 0, PEG_RADIUS);
              pg.fill(PEG_BASE_COLOR);
              pg.scale.set(1);
            }
          }
          dirty.clear();

          for (let i = glows.length - 1; i >= 0; i--) {
            const glow = glows[i];
            const elapsed = now - glow.startTime;
            if (elapsed >= PEG_GLOW_DURATION) {
              glows.splice(i, 1);
              continue;
            }
            const alpha = 1 - elapsed / PEG_GLOW_DURATION;
            const pg = pegs[glow.globalIndex];
            if (pg) {
              pg.clear();
              pg.circle(0, 0, PEG_RADIUS);
              pg.fill(lerpColor(PEG_BASE_COLOR, PEG_GLOW_COLOR, alpha));
              pg.scale.set(1 + (PEG_GLOW_SCALE - 1) * alpha);
              dirty.add(glow.globalIndex);
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
        coordinatorRef.current?.destroy();
        coordinatorRef.current = null;
        terminateWorker();
        if (appRef.current) {
          appRef.current.destroy({ removeView: true }, { children: true });
          appRef.current = null;
        }
        ballsRef.current = [];
        pegGlowsRef.current = [];
        ballGraphicsRef.current.clear();
      };
    }, []);

    useEffect(() => {
      const app = appRef.current;
      if (app) {
        for (const [, g] of ballGraphicsRef.current) {
          g.destroy();
        }
        ballGraphicsRef.current.clear();
        ballsRef.current = [];
        pegGlowsRef.current = [];

        buildBoard(app, rows);
        onBallCountChangeRef.current?.(0);
      }
    }, [rows, buildBoard]);

    useEffect(() => {
      multipliersRef.current = multipliers;
      if (!slotTextsRef.current || !multipliers) return;
      const useCompact = rows >= 14;
      multipliers.forEach((m, idx) => {
        const text = slotTextsRef.current?.[idx];
        if (text) text.text = formatMultiplier(m, useCompact);
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
        className="w-full h-full"
        role="img"
        aria-label="Plinko game board"
      />
    );
  },
);

export default PlinkoBoard;

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bv;
}
