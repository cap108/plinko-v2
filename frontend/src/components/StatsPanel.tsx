import { useState, useEffect, useMemo, memo } from 'react';
import type { BetResult } from '@plinko-v2/shared';

interface StatsPanelProps {
  balance: number;
  lastResults: BetResult[];
  totalWagered: number;
  totalWon: number;
  sessionStartTime: number;
  resetBalance: () => void;
}

function formatBalance(dollars: number): string {
  return '$' + Math.abs(dollars).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getMultiplierColor(mult: number): string {
  if (mult >= 10) return 'text-accent-gold';
  if (mult > 1) return 'text-accent-green';
  if (mult === 1) return 'text-text-secondary';
  return 'text-accent-red';
}

function formatBalanceFull(dollars: number): string {
  return '$' + dollars.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const StatsPanel = memo(function StatsPanel({
  balance, lastResults, totalWagered, totalWon, sessionStartTime, resetBalance,
}: StatsPanelProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - sessionStartTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionStartTime]);

  const stats = useMemo(() => {
    const netPL = totalWon - totalWagered;
    const bestMultiplier = lastResults.reduce((max, r) => Math.max(max, r.multiplier), 0);
    const wins = lastResults.filter(r => r.multiplier > 1).length;
    const winRate = lastResults.length > 0 ? (wins / lastResults.length) * 100 : 0;
    return { netPL, bestMultiplier, winRate };
  }, [lastResults, totalWon, totalWagered]);

  const balanceHeader = (
    <div className="mb-4">
      <p className="text-text-secondary text-xs font-medium">Balance</p>
      <div className="flex items-baseline gap-2">
        <p className="text-text-primary font-mono text-xl font-bold">{formatBalanceFull(balance)}</p>
        {balance < 100 && (
          <button
            onClick={resetBalance}
            className="text-accent-gold text-xs font-medium hover:underline transition-colors"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );

  if (lastResults.length === 0 && totalWagered === 0) {
    return (
      <div className="h-full flex flex-col">
        {balanceHeader}
        <p className="text-text-secondary text-sm text-center py-8">
          Place a bet to see your results
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {balanceHeader}

      {/* Summary Grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <StatCard label="Total Wagered" value={formatBalance(totalWagered)} />
        <StatCard label="Total Won" value={formatBalance(totalWon)} />
        <StatCard
          label="Net P/L"
          value={`${stats.netPL >= 0 ? '+' : '-'}${formatBalance(stats.netPL)}`}
          valueClass={stats.netPL >= 0 ? 'text-accent-green' : 'text-accent-red'}
        />
        <StatCard
          label="Best Multiplier"
          value={lastResults.length > 0 ? `${stats.bestMultiplier}x` : '\u2014'}
          valueClass={lastResults.length > 0 ? 'text-accent-gold' : undefined}
        />
        <StatCard
          label="Win Rate"
          value={lastResults.length > 0 ? `${stats.winRate.toFixed(1)}%` : '\u2014'}
        />
        <StatCard label="Session" value={formatDuration(elapsed)} />
      </div>

      {/* Results List — fills remaining height on desktop */}
      <div className="border-t border-border-subtle pt-3 flex-1 flex flex-col min-h-0">
        <h4 className="text-text-secondary text-xs font-medium mb-2">Recent Results</h4>
        <div className="space-y-1 flex-1 overflow-y-auto max-h-[40vh] lg:max-h-none">
          {lastResults.map((r, i) => (
            <div key={`${r.roundId}-${i}`} className="flex items-center justify-between py-1 px-2 rounded bg-surface-alt/50">
              <span className={`font-mono text-sm font-medium ${getMultiplierColor(r.multiplier)}`}>
                {r.multiplier}x
              </span>
              <span className={`font-mono text-xs ${r.winAmount > 0 ? 'text-accent-green' : 'text-text-secondary'}`}>
                {r.winAmount > 0 ? `+${formatBalance(r.winAmount)}` : '$0.00'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

function StatCard({ label, value, valueClass }: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-surface-alt/50 rounded p-2">
      <p className="text-text-secondary text-xs">{label}</p>
      <p className={`font-mono text-sm font-medium ${valueClass ?? 'text-text-primary'}`}>{value}</p>
    </div>
  );
}
