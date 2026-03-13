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
  getPegPositions,
  getSlotXBounds,
  getSlotY,
  getBoardHeight,
  getBallRadiusForRows,
  type PegPosition,
} from '@/plinko/boardLayout';
import { simulateAsync, terminateWorker } from '@/plinko/physicsWorkerClient';
import {
  createBallPlayback,
  tickBall,
  type BallPlayback,
  type SpeedPreset,
} from '@/plinko/playback';

// ---- Slot color tiers ----
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

// ---- Peg glow flash tracking ----
interface PegGlow {
  globalIndex: number;
  startTime: number;
}

const PEG_GLOW_DURATION = 300; // ms
const PEG_BASE_COLOR = 0xc0c0d0;
const PEG_GLOW_COLOR = 0x00e5ff;
const PEG_GLOW_SCALE = 2.0;

// ---- Component props ----

export interface PlinkoBoardProps {
  rows: RowCount;
  speed: SpeedPreset;
  multipliers?: number[];
  onBallLanded?: (dropId: number, slotIndex: number) => void;
  onBallCountChange?: (count: number) => void;
}

export interface PlinkoBoardHandle {
  dropBall: (slotIndex: number) => number;
  getBallCount: () => number;
}

function formatMultiplier(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(0)}K`;
  if (m >= 100) return `${Math.round(m)}x`;
  if (m >= 10) return `${m.toFixed(0)}x`;
  return `${m.toFixed(1)}x`;
}

const PlinkoBoard = forwardRef<PlinkoBoardHandle, PlinkoBoardProps>(
  function PlinkoBoard({ rows, speed, multipliers, onBallLanded, onBallCountChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);

    // Mutable state that lives across frames (not React state — no re-renders)
    const ballsRef = useRef<BallPlayback[]>([]);
    const pegGlowsRef = useRef<PegGlow[]>([]);
    const dirtyPegsRef = useRef<Set<number>>(new Set()); // globalIndices needing reset

    // Layer refs for PixiJS containers
    const pegLayerRef = useRef<Container | null>(null);
    const ballLayerRef = useRef<Container | null>(null);
    const slotLayerRef = useRef<Container | null>(null);
    const pegGraphicsRef = useRef<Graphics[]>([]);
    const ballGraphicsRef = useRef<Map<number, Graphics>>(new Map());
    const slotTextsRef = useRef<Text[]>([]);

    // Stable refs for props used in the animation loop
    const rowsRef = useRef(rows);
    const speedRef = useRef(speed);
    const multipliersRef = useRef(multipliers);
    const onBallLandedRef = useRef(onBallLanded);
    const onBallCountChangeRef = useRef(onBallCountChange);
    rowsRef.current = rows;
    speedRef.current = speed;
    multipliersRef.current = multipliers;
    onBallLandedRef.current = onBallLanded;
    onBallCountChangeRef.current = onBallCountChange;

    // ---- Build static layers when rows or app changes ----
    const buildBoard = useCallback((app: Application, rowCount: RowCount) => {
      // Clear existing layers
      if (pegLayerRef.current) app.stage.removeChild(pegLayerRef.current);
      if (ballLayerRef.current) app.stage.removeChild(ballLayerRef.current);
      if (slotLayerRef.current) app.stage.removeChild(slotLayerRef.current);

      const pegLayer = new Container();
      const ballLayer = new Container();
      const slotLayer = new Container();

      pegLayerRef.current = pegLayer;
      ballLayerRef.current = ballLayer;
      slotLayerRef.current = slotLayer;

      // Scale the logical board to fill the renderer
      const boardH = getBoardHeight(rowCount);
      const scaleX = app.screen.width / BOARD_WIDTH;
      const scaleY = app.screen.height / boardH;
      const scale = Math.min(scaleX, scaleY);
      const offsetX = (app.screen.width - BOARD_WIDTH * scale) / 2;
      const offsetY = (app.screen.height - boardH * scale) / 2;

      for (const layer of [pegLayer, ballLayer, slotLayer]) {
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
      slotTextsRef.current = [];

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

        const multipliersArr = multipliersRef.current;
        const label = multipliersArr?.[s] != null
          ? formatMultiplier(multipliersArr[s])
          : String(s);
        const style = new TextStyle({
          fontFamily: 'Orbitron, system-ui, sans-serif',
          fontSize: Math.min(10, slotW * 0.35),
          fontWeight: 'bold',
          fill: color,
        });
        const text = new Text({ text: label, style });
        text.anchor.set(0.5);
        text.position.set(cx, slotYPos);
        slotLayer.addChild(text);
        slotTextsRef.current.push(text);
      }

      // Add layers in order: pegs (back), balls (middle), slots (front)
      app.stage.addChild(pegLayer);
      app.stage.addChild(ballLayer);
      app.stage.addChild(slotLayer);
    }, []);

    // ---- Main useEffect: init PixiJS app, animation loop, cleanup ----
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let destroyed = false;
      let rafId = 0;

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

        // Handle resize
        const onResize = () => {
          buildBoard(app, rowsRef.current);
        };
        app.renderer.on('resize', onResize);

        // ---- Animation loop ----
        const tick = () => {
          if (destroyed) return;
          const now = performance.now();
          const balls = ballsRef.current;
          const ballGfx = ballGraphicsRef.current;
          const ballLayer = ballLayerRef.current;
          const pegs = pegGraphicsRef.current;
          const glows = pegGlowsRef.current;

          // Update each ball
          let countChanged = false;
          for (let i = balls.length - 1; i >= 0; i--) {
            const ball = balls[i];
            const update = tickBall(ball, now);

            if (!update) {
              // Fade-out complete — remove the ball
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

            // Position the ball sprite
            let g = ballGfx.get(ball.id);
            if (!g && ballLayer) {
              g = new Graphics();
              const br = getBallRadiusForRows(rowsRef.current);
              g.circle(0, 0, br);
              g.fill(0x00e5ff);
              ballLayer.addChild(g);
              ballGfx.set(ball.id, g);
            }
            if (g) {
              g.position.set(update.pos.x, update.pos.y);
              g.alpha = update.alpha;
            }

            // Register peg glows
            for (const hit of update.newPegHits) {
              glows.push({ globalIndex: hit.globalIndex, startTime: now });
            }

            // Handle landing
            if (update.justLanded) {
              onBallLandedRef.current?.(ball.dropId, ball.slotIndex);
              countChanged = true;
            }
          }

          if (countChanged) {
            onBallCountChangeRef.current?.(balls.length);
          }

          // ---- Update peg glows ----
          // Only redraw pegs that were glowing last frame (reset to base)
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

          // Apply active glows (redraw only glowing pegs)
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

          rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
      })();

      return () => {
        destroyed = true;
        cancelAnimationFrame(rafId);
        terminateWorker();
        if (appRef.current) {
          appRef.current.destroy({ removeView: true }, { children: true });
          appRef.current = null;
        }
        ballsRef.current = [];
        pegGlowsRef.current = [];
        ballGraphicsRef.current.clear();
      };
    }, []); // Single mount — rows changes are handled by rebuild

    // Rebuild board when rows prop changes
    useEffect(() => {
      const app = appRef.current;
      if (app) {
        // Clear all in-flight balls
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

    // Update slot labels when multipliers change (text-only, no board rebuild)
    useEffect(() => {
      multipliersRef.current = multipliers;
      if (!slotTextsRef.current || !multipliers) return;
      multipliers.forEach((m, idx) => {
        const text = slotTextsRef.current?.[idx];
        if (text) text.text = formatMultiplier(m);
      });
    }, [multipliers]);

    // ---- Drop ball API ----
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

// ---- Utility: linear color interpolation ----

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
