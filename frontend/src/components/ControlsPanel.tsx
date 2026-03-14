import { useState, useId, useRef, useEffect, memo } from 'react';
import type { RowCount, RiskLevel, ConfigResponse } from '@plinko-v2/shared';
import type { SpeedPreset } from '@/plinko/playback';
import type { AutoBetConfig } from '@/types/autoBet';

/** Formats a bet amount: whole dollars as "5", fractional as "5.20" */
function formatBet(v: number): string {
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

/** Controlled-on-blur bet input — lets users type freely, commits on blur/Enter */
function BetInput({ id, value, min, max, onChange, className }: {
  id: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  className: string;
}) {
  const [local, setLocal] = useState(formatBet(value));
  const focused = useRef(false);

  // Sync from parent when not focused (e.g. quick buttons, external changes)
  useEffect(() => {
    if (!focused.current) setLocal(formatBet(value));
  }, [value]);

  const commit = () => {
    const v = parseFloat(local);
    if (!isNaN(v)) {
      const clamped = Math.max(min, Math.min(max, v));
      onChange(clamped);
      setLocal(formatBet(clamped));
    } else {
      setLocal(formatBet(value));
    }
  };

  return (
    <input
      id={id}
      type="number"
      step={0.10}
      min={min}
      max={max}
      value={local}
      onFocus={(e) => { focused.current = true; e.target.select(); }}
      onBlur={() => { focused.current = false; commit(); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
      onChange={(e) => {
        const v = e.target.value;
        // Allow typing freely but cap at 2 decimal places
        if (/^\d*\.?\d{0,2}$/.test(v) || v === '') setLocal(v);
      }}
      className={className}
    />
  );
}

const ROW_OPTIONS: RowCount[] = [8, 10, 12, 14, 16];
const RISK_OPTIONS: RiskLevel[] = ['low', 'medium', 'high'];
const RISK_LABELS: Record<RiskLevel, { short: string; full: string }> = {
  low: { short: 'Low', full: 'Low' },
  medium: { short: 'Med', full: 'Medium' },
  high: { short: 'High', full: 'High' },
};
const SPEED_OPTIONS: SpeedPreset[] = ['slow', 'regular', 'turbo'];

function formatBalance(dollars: number): string {
  return dollars.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface ControlsPanelProps {
  // Game settings
  betAmount: number;
  setBetAmount: (n: number) => void;
  numBalls: number;
  setNumBalls: (n: number) => void;
  rows: RowCount;
  setRows: (r: RowCount) => void;
  riskLevel: RiskLevel;
  setRiskLevel: (r: RiskLevel) => void;
  speed: SpeedPreset;
  setSpeed: (s: SpeedPreset) => void;
  // State
  balance: number;
  playing: boolean;
  betPending: boolean;
  config: ConfigResponse | null;
  error: string | null;
  clearError: () => void;
  // Actions
  placeBet: () => void;
  // Auto-bet
  autoBetActive: boolean;
  autoBetRoundsCompleted: number;
  autoBetConfig: AutoBetConfig;
  onAutoBetConfigChange: (config: AutoBetConfig) => void;
  onAutoBetToggle: () => void;
  autoBetStopReason: string | null;
  // Ball tracking
  activeBallCount: number;
}

export const ControlsPanel = memo(function ControlsPanel({
  betAmount, setBetAmount, numBalls, setNumBalls,
  rows, setRows, riskLevel, setRiskLevel,
  speed, setSpeed,
  balance, playing, betPending, config, error, clearError,
  placeBet,
  autoBetActive, autoBetRoundsCompleted, autoBetConfig, onAutoBetConfigChange, onAutoBetToggle,
  autoBetStopReason, activeBallCount,
}: ControlsPanelProps) {
  const formId = useId();
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');

  if (!config) return null;

  const betAmountDisabled = betPending || autoBetActive;
  const rowsBallCountDisabled = betPending || playing || autoBetActive;

  return (
    <div className="space-y-3 lg:space-y-4">
      {/* Manual / Auto mode tabs */}
      <div className="flex bg-surface-alt rounded overflow-hidden">
        <button
          onClick={() => !autoBetActive && setMode('manual')}
          className={`flex-1 py-1.5 lg:py-2 text-sm font-medium transition-colors min-h-[44px]
            ${mode === 'manual'
              ? 'bg-accent-cyan text-surface'
              : 'text-text-secondary hover:text-text-primary'
            } ${autoBetActive ? 'cursor-not-allowed' : ''}`}
        >
          Manual
        </button>
        <button
          onClick={() => !autoBetActive && setMode('auto')}
          className={`flex-1 py-1.5 lg:py-2 text-sm font-medium transition-colors min-h-[44px]
            ${mode === 'auto'
              ? 'bg-accent-cyan text-surface'
              : 'text-text-secondary hover:text-text-primary'
            } ${autoBetActive ? 'cursor-not-allowed' : ''}`}
        >
          Auto
        </button>
      </div>

      {/* Mobile: Bet Amount + Balance side by side */}
      <div className="flex gap-3 lg:hidden">
        <div className={`flex-1 ${betAmountDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <label htmlFor={`${formId}-bet-amount-m`} className="block text-text-secondary text-xs mb-1">
            Bet Amount
          </label>
          <BetInput
            id={`${formId}-bet-amount-m`}
            value={betAmount}
            min={config.minBet}
            max={config.maxBet}
            onChange={setBetAmount}
            className="w-full px-2 py-1.5 bg-surface-alt border border-border-subtle rounded text-text-primary font-mono text-sm
              focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          />
        </div>
        <div className="flex-1 text-right">
          <p className="text-text-secondary text-xs mb-1">Balance (Fun)</p>
          <p className="text-text-primary font-mono text-sm font-bold py-1.5">{formatBalance(balance)}</p>
        </div>
      </div>
      {/* Mobile: quick bet buttons below */}
      <div className={`flex gap-1 lg:hidden ${betAmountDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <QuickButton label="Min" disabled={betAmount <= config.minBet}
          onClick={() => setBetAmount(config.minBet)} />
        <QuickButton label={'\u00BD'} disabled={betAmount <= config.minBet}
          onClick={() => setBetAmount(Math.max(config.minBet, Math.round(betAmount / 2 * 100) / 100))} />
        <QuickButton label={'2\u00D7'} disabled={betAmount >= config.maxBet}
          onClick={() => setBetAmount(Math.min(config.maxBet, Math.round(betAmount * 2 * 100) / 100))} />
        <QuickButton label="Max" disabled={betAmount >= Math.min(config.maxBet, balance)}
          onClick={() => setBetAmount(Math.min(config.maxBet, balance))} />
      </div>

      {/* Desktop: Bet Amount full width with buttons below */}
      <div className={`hidden lg:block ${betAmountDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <label htmlFor={`${formId}-bet-amount`} className="block text-text-secondary text-xs mb-1">
          Bet Amount
        </label>
        <BetInput
          id={`${formId}-bet-amount`}
          value={betAmount}
          min={config.minBet}
          max={config.maxBet}
          onChange={setBetAmount}
          className="w-full px-3 py-2 bg-surface-alt border border-border-subtle rounded text-text-primary font-mono
            focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        />
        <div className="flex gap-1 mt-1">
          <QuickButton label="Min" disabled={betAmount <= config.minBet}
            onClick={() => setBetAmount(config.minBet)} />
          <QuickButton label={'\u00BD'} disabled={betAmount <= config.minBet}
            onClick={() => setBetAmount(Math.max(config.minBet, Math.round(betAmount / 2 * 100) / 100))} />
          <QuickButton label={'2\u00D7'} disabled={betAmount >= config.maxBet}
            onClick={() => setBetAmount(Math.min(config.maxBet, Math.round(betAmount * 2 * 100) / 100))} />
          <QuickButton label="Max" disabled={betAmount >= Math.min(config.maxBet, balance)}
            onClick={() => setBetAmount(Math.min(config.maxBet, balance))} />
        </div>
      </div>

      {/* Rows + Risk — side by side on mobile */}
      <div className="flex gap-3 lg:flex-col">
        <div className={`shrink-0 ${rowsBallCountDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <LabelWithHelp label="Rows" help="More rows = more pegs, higher maximum payouts." />
          <div className="flex gap-1 flex-nowrap" role="radiogroup" aria-label="Payout Table Rows">
            {ROW_OPTIONS.map((r) => (
              <ToggleButton
                key={r}
                label={String(r)}
                active={rows === r}
                onClick={() => setRows(r)}
              />
            ))}
          </div>
        </div>

        <div className="flex-1">
          <LabelWithHelp label="Risk" help="Higher risk = bigger edge multipliers, smaller center multipliers." align="right" />
          <div className="flex gap-1 justify-end lg:justify-start" role="radiogroup" aria-label="Risk Level">
            {RISK_OPTIONS.map((r) => (
              <ToggleButton
                key={r}
                label={RISK_LABELS[r].full}
                mobileLabel={RISK_LABELS[r].short}
                active={riskLevel === r}
                onClick={() => setRiskLevel(r)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Speed — desktop only (mobile has it on the board) */}
      <div className="hidden lg:block">
        <label className="block text-text-secondary text-xs mb-1">Speed</label>
        <div className="flex gap-1" role="radiogroup" aria-label="Ball Speed">
          {SPEED_OPTIONS.map((s) => (
            <ToggleButton
              key={s}
              label={s.charAt(0).toUpperCase() + s.slice(1)}
              active={speed === s}
              onClick={() => setSpeed(s)}
            />
          ))}
        </div>
      </div>

      {/* Ball Count */}
      <div className={rowsBallCountDisabled ? 'opacity-50 pointer-events-none' : ''}>
        <label htmlFor={`${formId}-ball-count`} className="block text-text-secondary text-xs mb-1">
          Balls: {numBalls}
        </label>
        <input
          id={`${formId}-ball-count`}
          type="range"
          min={1}
          max={100}
          value={numBalls}
          onChange={(e) => setNumBalls(Number(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Auto-bet stop conditions — only in auto mode */}
      {mode === 'auto' && (
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-2 border-t border-border-subtle pt-2 lg:pt-3">
          <AutoBetInput label="Max Rounds" value={autoBetConfig.maxRounds} placeholder="1"
            onChange={v => onAutoBetConfigChange({...autoBetConfig, maxRounds: v})} disabled={autoBetActive} />
          <AutoBetInput label="Stop Loss ($)" value={autoBetConfig.stopOnLoss} placeholder="Off"
            onChange={v => onAutoBetConfigChange({...autoBetConfig, stopOnLoss: v})} disabled={autoBetActive} />
          <AutoBetInput label="Take Profit ($)" value={autoBetConfig.stopOnProfit} placeholder="Off"
            onChange={v => onAutoBetConfigChange({...autoBetConfig, stopOnProfit: v})} disabled={autoBetActive} />
        </div>
      )}

      {/* Action button — changes based on mode and state */}
      {autoBetActive ? (
        <button
          onClick={onAutoBetToggle}
          className="w-full px-4 py-2.5 lg:py-3 bg-accent-red text-white font-bold rounded text-sm lg:text-base
            hover:brightness-110 transition-all min-h-[44px] lg:min-h-[48px]
            focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          STOP AUTO ({autoBetRoundsCompleted})
        </button>
      ) : mode === 'auto' ? (
        <button
          onClick={onAutoBetToggle}
          disabled={playing}
          className={`w-full px-4 py-2.5 lg:py-3 font-bold rounded text-sm lg:text-base transition-all min-h-[44px] lg:min-h-[48px]
            focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-surface
            bg-accent-green text-surface hover:brightness-110
            ${playing ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          START AUTO
        </button>
      ) : (
        <button
          onClick={placeBet}
          disabled={!config}
          className={`w-full px-4 py-2.5 lg:py-3 font-bold rounded text-sm lg:text-base transition-all min-h-[44px] lg:min-h-[48px]
            active:scale-95
            focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-surface
            bg-accent-cyan text-surface hover:brightness-110
            ${!config ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {`BET ${formatBalance(betAmount)} \u00D7 ${numBalls}`}
        </button>
      )}

      {/* Auto-bet stop reason */}
      {autoBetStopReason && !autoBetActive && (
        <p className="text-accent-gold text-xs text-center">{autoBetStopReason}</p>
      )}

      {/* Balls in flight indicator */}
      {activeBallCount > 0 && (
        <p className="text-text-secondary text-xs text-center">
          {activeBallCount} ball{activeBallCount !== 1 ? 's' : ''} in flight
        </p>
      )}

      {/* Error display */}
      {error && (
        <div role="alert" className="p-2 lg:p-3 border-l-2 border-status-error bg-status-error/10
          text-text-primary text-sm flex items-center justify-between min-h-[44px] lg:min-h-[56px]">
          <span>{error}</span>
          <button onClick={clearError} className="ml-2 text-text-secondary hover:text-text-primary
            min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
            aria-label="Dismiss error">
            {'\u2715'}
          </button>
        </div>
      )}
    </div>
  );
});

// ---- Internal components ----

function LabelWithHelp({ label, help, align }: {
  label: string;
  help: string;
  align?: 'right';
}) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const tipPos = align === 'right'
    ? 'right-0 lg:right-auto lg:left-0'
    : 'left-0';
  const tipStyle = 'absolute bottom-full mb-1.5 px-2.5 py-1.5 bg-surface border border-border-subtle rounded shadow-lg text-text-primary text-xs font-normal normal-case w-48 text-left z-50';

  return (
    <div className={`flex items-center gap-1 mb-1 ${align === 'right' ? 'justify-end lg:justify-start' : ''}`}>
      <span className="text-text-secondary text-xs">{label}</span>
      {/* sr-only tooltip text for aria-describedby */}
      <span id={tooltipId} role="tooltip" className="sr-only">{help}</span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="group w-4 h-4 flex items-center justify-center rounded-full
            text-text-secondary hover:text-text-primary text-[10px] leading-none
            bg-surface-alt hover:bg-surface-alt/80 transition-colors"
          aria-label={`${label} info`}
          aria-describedby={tooltipId}
        >
          ?
          {/* Desktop hover tooltip */}
          <div className={`hidden group-hover:block ${tipStyle} ${tipPos} pointer-events-none`} aria-hidden="true">
            {help}
          </div>
        </button>
        {/* Mobile tap tooltip */}
        {open && (
          <>
            <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)} />
            <div className={`lg:hidden ${tipStyle} ${tipPos}`} aria-hidden="true">
              {help}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AutoBetInput({ label, value, placeholder, onChange, disabled }: {
  label: string;
  value: number;
  placeholder: string;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label className="block text-text-secondary text-xs mb-0.5">{label}</label>
      <input
        type="number"
        min={0}
        max={1000000}
        step={1}
        value={value || ''}
        placeholder={placeholder}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChange(isNaN(v) || v < 0 ? 0 : v);
        }}
        disabled={disabled}
        className="w-full px-2 py-1.5 bg-surface-alt border border-border-subtle rounded text-text-primary font-mono text-sm
          focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-surface
          disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function ToggleButton({ label, mobileLabel, active, onClick }: {
  label: string;
  mobileLabel?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="radio"
      aria-checked={active}
      aria-label={label}
      onClick={onClick}
      className={`px-2 py-1 lg:px-3 lg:py-1.5 rounded text-xs lg:text-sm font-medium capitalize transition-colors
        min-w-[44px] min-h-[44px]
        flex items-center justify-center
        focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-surface
        ${active
          ? 'bg-accent-cyan text-surface'
          : 'bg-surface-alt text-text-secondary hover:text-text-primary'
        }`}
    >
      {mobileLabel ? (
        <>
          <span className="lg:hidden">{mobileLabel}</span>
          <span className="hidden lg:inline">{label}</span>
        </>
      ) : label}
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
      className={`min-w-[44px] min-h-[44px] px-2 flex items-center justify-center
        rounded text-xs lg:text-sm font-medium transition-colors
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
