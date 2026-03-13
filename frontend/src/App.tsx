import { useRef, useState, useCallback } from 'react';
import type { RowCount } from '@plinko-v2/shared';
import PlinkoBoard, { type PlinkoBoardHandle } from '@/components/PlinkoBoard';
import type { SpeedPreset } from '@/plinko/playback';

const ROW_OPTIONS: RowCount[] = [8, 10, 12, 14, 16];
const SPEED_OPTIONS: SpeedPreset[] = ['slow', 'regular', 'turbo'];

export default function App() {
  const boardRef = useRef<PlinkoBoardHandle>(null);
  const [rows, setRows] = useState<RowCount>(12);
  const [speed, setSpeed] = useState<SpeedPreset>('regular');
  const [targetSlot, setTargetSlot] = useState(6);
  const [ballCount, setBallCount] = useState(0);

  const maxSlot = rows; // slots = rows + 1, so valid indices are 0..rows

  const handleDrop = useCallback(() => {
    boardRef.current?.dropBall(Math.min(targetSlot, maxSlot));
  }, [targetSlot, maxSlot]);

  const handleRandomDrop = useCallback(() => {
    const slot = Math.floor(Math.random() * (maxSlot + 1));
    boardRef.current?.dropBall(slot);
  }, [maxSlot]);

  const handleBallCountChange = useCallback((count: number) => {
    setBallCount(count);
  }, []);

  const handleBallLanded = useCallback((slotIndex: number) => {
    console.log(`Ball landed in slot ${slotIndex}`);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Header */}
      <header className="h-14 flex items-center px-4 border-b border-border-subtle">
        <h1 className="text-accent-cyan font-bold text-lg font-heading">
          PlinkoVibe
        </h1>
        <span className="ml-auto text-text-secondary text-sm">
          Phase 2 — Core Game Loop
        </span>
      </header>

      {/* Main layout */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left sidebar — test controls */}
        <aside className="lg:w-72 border-r border-border-subtle p-4 space-y-4 overflow-y-auto">
          <h2 className="text-text-primary font-semibold text-sm uppercase tracking-wider">
            Test Controls
          </h2>

          {/* Rows selector */}
          <div>
            <label className="block text-text-secondary text-xs mb-1">
              Rows
            </label>
            <div className="flex gap-1">
              {ROW_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => { setRows(r); setTargetSlot(Math.min(targetSlot, r)); }}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    rows === r
                      ? 'bg-accent-cyan text-surface'
                      : 'bg-surface-elevated text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Speed selector */}
          <div>
            <label className="block text-text-secondary text-xs mb-1">
              Speed
            </label>
            <div className="flex gap-1">
              {SPEED_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-3 py-1.5 rounded text-sm font-medium capitalize transition-colors ${
                    speed === s
                      ? 'bg-accent-cyan text-surface'
                      : 'bg-surface-elevated text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Target slot */}
          <div>
            <label className="block text-text-secondary text-xs mb-1">
              Target Slot: {targetSlot} / {maxSlot}
            </label>
            <input
              type="range"
              min={0}
              max={maxSlot}
              value={Math.min(targetSlot, maxSlot)}
              onChange={(e) => setTargetSlot(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Drop buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleDrop}
              className="flex-1 px-4 py-2 bg-accent-cyan text-surface font-bold rounded hover:brightness-110 transition-all"
            >
              Drop to Slot {targetSlot}
            </button>
          </div>

          <button
            onClick={handleRandomDrop}
            className="w-full px-4 py-2 bg-accent-magenta text-white font-bold rounded hover:brightness-110 transition-all"
          >
            Random Drop
          </button>

          {/* Ball count */}
          <div className="text-text-secondary text-sm">
            Balls in flight: <span className="text-accent-cyan font-mono">{ballCount}</span>
          </div>
        </aside>

        {/* Board region */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-lg aspect-[3/4]">
            <PlinkoBoard
              ref={boardRef}
              rows={rows}
              speed={speed}
              onBallLanded={handleBallLanded}
              onBallCountChange={handleBallCountChange}
            />
          </div>
        </div>

        {/* Right sidebar placeholder */}
        <aside className="hidden lg:block w-72 border-l border-border-subtle p-4">
          <p className="text-text-secondary text-sm">Stats — Phase 5</p>
        </aside>
      </main>
    </div>
  );
}
