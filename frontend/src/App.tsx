import { useRef, useCallback, useState, useEffect } from 'react';
import type { RowCount, RiskLevel } from '@plinko-v2/shared';
import PlinkoBoard, { type PlinkoBoardHandle } from '@/components/PlinkoBoard';
import { usePlinko } from '@/hooks/usePlinko';
import type { SpeedPreset } from '@/plinko/playback';

const ROW_OPTIONS: RowCount[] = [8, 10, 12, 14, 16];
const RISK_OPTIONS: RiskLevel[] = ['low', 'medium', 'high'];
const SPEED_OPTIONS: SpeedPreset[] = ['slow', 'regular', 'turbo'];

function formatBalance(dollars: number): string {
  return '$' + dollars.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDollars(dollars: number): string {
  const sign = dollars >= 0 ? '+' : '';
  return sign + '$' + Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function isTransientError(msg: string): boolean {
  return !msg.includes('Insufficient') && !msg.includes('too fast') && !msg.includes('too many');
}

export default function App() {
  const boardRef = useRef<PlinkoBoardHandle>(null);
  const [ballCount, setBallCount] = useState(0);

  const dropBall = useCallback((slotIndex: number): number => {
    return boardRef.current?.dropBall(slotIndex) ?? -1;
  }, []);

  const plinko = usePlinko({ onDropBall: dropBall });

  const handleBallCountChange = useCallback((count: number) => {
    setBallCount(count);
  }, []);

  // Auto-clear transient errors
  useEffect(() => {
    if (plinko.error && isTransientError(plinko.error)) {
      const timer = setTimeout(() => plinko.clearError(), 5000);
      return () => clearTimeout(timer);
    }
  }, [plinko.error, plinko.clearError]);

  const disabled = plinko.playing || plinko.betPending;
  const lastResult = plinko.lastResults[0] ?? null;

  // Loading state
  if (plinko.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <p className="text-accent-cyan text-xl font-heading animate-pulse">Loading PlinkoVibe...</p>
      </div>
    );
  }

  // Config failed
  if (!plinko.config && plinko.error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface gap-4">
        <p className="text-status-error">{plinko.error}</p>
        <button onClick={() => window.location.reload()}
          className="px-4 py-2 bg-accent-cyan text-surface rounded font-bold">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Header */}
      <header className="h-14 flex items-center px-4 border-b border-border-subtle">
        <h1 className="text-accent-cyan font-bold text-lg font-heading">
          PlinkoVibe
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-text-primary font-mono text-lg whitespace-nowrap overflow-hidden text-ellipsis">
            {formatBalance(plinko.balance)}
          </span>
          {lastResult && (
            <span className={`text-sm font-mono transition-opacity duration-[2000ms] ${
              lastResult.multiplier >= 1 ? 'text-accent-green' : 'text-accent-red'
            }`}>
              {formatDollars(lastResult.winAmount - plinko.betAmount)}
              ({lastResult.multiplier}x)
            </span>
          )}
        </div>
      </header>

      {/* Main layout */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left sidebar — betting controls (desktop) */}
        <aside className="hidden lg:flex lg:w-72 border-r border-border-subtle p-4 flex-col gap-4 overflow-y-auto">
          <BettingControls
            plinko={plinko}
            disabled={disabled}
          />
        </aside>

        {/* Board region */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="w-full max-w-lg aspect-[3/4]">
            <PlinkoBoard
              ref={boardRef}
              rows={plinko.rows}
              speed={plinko.speed}
              multipliers={plinko.currentMultipliers ?? undefined}
              onBallLanded={plinko.handleBallLanded}
              onBallCountChange={handleBallCountChange}
            />
          </div>
        </div>

        {/* Right sidebar placeholder */}
        <aside className="hidden lg:block w-72 border-l border-border-subtle p-4">
          <p className="text-text-secondary text-sm">Stats — Phase 5</p>
          <div className="text-text-secondary text-sm mt-2">
            Balls in flight: <span className="text-accent-cyan font-mono">{ballCount}</span>
          </div>
        </aside>
      </main>

      {/* Mobile controls (below board) */}
      <div className="lg:hidden border-t border-border-subtle p-4 overflow-y-auto max-h-[40vh]">
        <BettingControls
          plinko={plinko}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

// ---- Betting Controls Component ----

type PlinkoHook = ReturnType<typeof usePlinko>;

function BettingControls({ plinko, disabled }: { plinko: PlinkoHook; disabled: boolean }) {
  const config = plinko.config;
  if (!config) return null;

  const zeroBalance = plinko.balance <= 0 && !plinko.playing;

  return (
    <div className="space-y-4">
      {/* Bet Amount */}
      <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
        <label className="block text-text-secondary text-xs mb-1">
          Bet Amount
        </label>
        <input
          type="number"
          step={0.10}
          min={config.minBet}
          max={config.maxBet}
          value={plinko.betAmount}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) plinko.setBetAmount(Math.max(config.minBet, Math.min(config.maxBet, v)));
          }}
          className="w-full px-3 py-2 bg-surface-alt border border-border-subtle rounded text-text-primary font-mono
            focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        />
        <div className="flex gap-1 mt-1">
          <QuickButton
            label="Min"
            disabled={plinko.betAmount <= config.minBet}
            onClick={() => plinko.setBetAmount(config.minBet)}
          />
          <QuickButton
            label={'\u00BD'}
            disabled={plinko.betAmount <= config.minBet}
            onClick={() => plinko.setBetAmount(Math.max(config.minBet, Math.round(plinko.betAmount / 2 * 100) / 100))}
          />
          <QuickButton
            label={'2\u00D7'}
            disabled={plinko.betAmount >= config.maxBet}
            onClick={() => plinko.setBetAmount(Math.min(config.maxBet, Math.round(plinko.betAmount * 2 * 100) / 100))}
          />
          <QuickButton
            label="Max"
            disabled={plinko.betAmount >= Math.min(config.maxBet, plinko.balance)}
            onClick={() => plinko.setBetAmount(Math.min(config.maxBet, plinko.balance))}
          />
        </div>
      </div>

      {/* Rows */}
      <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
        <label className="block text-text-secondary text-xs mb-1">Rows</label>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Payout Table Rows">
          {ROW_OPTIONS.map((r) => (
            <ToggleButton
              key={r}
              label={String(r)}
              active={plinko.rows === r}
              onClick={() => plinko.setRows(r)}
            />
          ))}
        </div>
      </div>

      {/* Risk — stays interactive during play */}
      <div>
        <label className="block text-text-secondary text-xs mb-1">Risk</label>
        <div className="flex gap-1" role="radiogroup" aria-label="Risk Level">
          {RISK_OPTIONS.map((r) => (
            <ToggleButton
              key={r}
              label={r.charAt(0).toUpperCase() + r.slice(1)}
              active={plinko.riskLevel === r}
              onClick={() => plinko.setRiskLevel(r)}
            />
          ))}
        </div>
      </div>

      {/* Speed — stays interactive during play */}
      <div>
        <label className="block text-text-secondary text-xs mb-1">Speed</label>
        <div className="flex gap-1" role="radiogroup" aria-label="Ball Speed">
          {SPEED_OPTIONS.map((s) => (
            <ToggleButton
              key={s}
              label={s.charAt(0).toUpperCase() + s.slice(1)}
              active={plinko.speed === s}
              onClick={() => plinko.setSpeed(s)}
            />
          ))}
        </div>
      </div>

      {/* Ball Count */}
      <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
        <label className="block text-text-secondary text-xs mb-1">
          Balls: {plinko.numBalls}
        </label>
        <input
          type="range"
          min={1}
          max={100}
          value={plinko.numBalls}
          onChange={(e) => plinko.setNumBalls(Number(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Bet Button / Zero Balance */}
      {zeroBalance ? (
        <button
          onClick={plinko.resetBalance}
          className="w-full px-4 py-3 bg-accent-gold text-surface font-bold rounded text-base
            hover:brightness-110 transition-all min-h-[48px]
            focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          New Game ($1,000)
        </button>
      ) : (
        <button
          onClick={plinko.placeBet}
          disabled={disabled || !plinko.config}
          aria-busy={plinko.betPending}
          className={`w-full px-4 py-3 font-bold rounded text-base transition-all min-h-[48px]
            focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-surface
            ${disabled
              ? 'bg-accent-cyan/75 cursor-wait text-surface'
              : 'bg-accent-cyan text-surface hover:brightness-110'
            } ${!plinko.config ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {plinko.betPending
            ? 'Placing Bet...'
            : `BET ${formatBalance(plinko.betAmount)} \u00D7 ${plinko.numBalls}`}
        </button>
      )}

      {/* Error display */}
      {plinko.error && (
        <div role="alert" className="mt-2 p-3 border-l-2 border-status-error bg-status-error/10
          text-text-primary text-sm flex items-center justify-between min-h-[56px]">
          <span>{plinko.error}</span>
          <button onClick={plinko.clearError} className="ml-2 text-text-secondary hover:text-text-primary
            min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
            aria-label="Dismiss error">
            {'\u2715'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Shared UI primitives ----

function ToggleButton({ label, active, onClick }: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-sm font-medium capitalize transition-colors min-w-[44px] min-h-[44px]
        flex items-center justify-center
        focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-surface
        ${active
          ? 'bg-accent-cyan text-surface'
          : 'bg-surface-alt text-text-secondary hover:text-text-primary'
        }`}
    >
      {label}
    </button>
  );
}

function QuickButton({ label, disabled, onClick }: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 min-w-[44px] min-h-[44px] flex items-center justify-center
        rounded text-sm font-medium transition-colors
        focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-surface
        ${disabled
          ? 'bg-surface-alt text-text-secondary opacity-50 cursor-not-allowed'
          : 'bg-surface-alt text-text-secondary hover:text-text-primary hover:bg-surface-alt/80'
        }`}
    >
      {label}
    </button>
  );
}
