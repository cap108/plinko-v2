import { useRef, useCallback, useState, useEffect, type JSX } from 'react';
import type { SpeedPreset } from '@/plinko/playback';
import PlinkoBoard, { type PlinkoBoardHandle } from '@/components/PlinkoBoard';
import { usePlinko } from '@/hooks/usePlinko';
import { useAutoBet } from '@/hooks/useAutoBet';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { MuteButton } from '@/components/MuteButton';
import { SplashScreen } from '@/components/SplashScreen';
import { Layout } from '@/components/Layout';
import { ControlsPanel } from '@/components/ControlsPanel';
import { StatsPanel } from '@/components/StatsPanel';
import { ensureAudioResumed, startBackgroundMusic } from '@/sound/audioContext';

function isTransientError(msg: string): boolean {
  return !msg.includes('Insufficient') && !msg.includes('too fast') && !msg.includes('too many');
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <p className="text-accent-cyan text-xl font-heading animate-pulse">Loading PlinkoVibe...</p>
    </div>
  );
}

function ErrorScreen({ error }: { error: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface gap-4">
      <p className="text-status-error">{error}</p>
      <button onClick={() => window.location.reload()}
        className="px-4 py-2 bg-accent-cyan text-surface rounded font-bold">
        Retry
      </button>
    </div>
  );
}

function HotkeysHint() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative hidden lg:block">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-9 h-9 flex items-center justify-center rounded text-text-secondary hover:text-text-primary
          hover:bg-surface-alt transition-colors text-sm font-bold"
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts"
      >
        ?
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-surface border border-border-subtle rounded-lg shadow-lg p-3 w-52">
            <p className="text-text-primary text-xs font-medium mb-2">Keyboard Shortcuts</p>
            <div className="space-y-1.5 text-xs">
              <HotkeyRow keys="Space" desc="Place bet / Stop auto" />
              <HotkeyRow keys="+" desc="Double bet" />
              <HotkeyRow keys="-" desc="Halve bet" />
              <HotkeyRow keys="M" desc="Toggle sound" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function HotkeyRow({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div className="flex items-center justify-between">
      <kbd className="px-1.5 py-0.5 bg-surface-alt rounded text-text-primary font-mono text-[10px]">{keys}</kbd>
      <span className="text-text-secondary">{desc}</span>
    </div>
  );
}

const SPEED_OPTS: SpeedPreset[] = ['slow', 'regular', 'turbo'];
const SPEED_LABELS: Record<SpeedPreset, string> = { slow: 'Slow', regular: 'Reg.', turbo: 'Turbo' };

function MobileSpeedOverlay({ speed, setSpeed, children }: {
  speed: SpeedPreset;
  setSpeed: (s: SpeedPreset) => void;
  children: JSX.Element;
}) {
  return (
    <div className="relative w-full h-full">
      {children}
      {/* Speed toggle — mobile only, top-right of board */}
      <div className="absolute top-1 right-1 lg:hidden flex flex-col items-center gap-0.5 bg-surface/80 rounded-lg px-2 py-1 backdrop-blur-sm">
        <span className="text-text-secondary text-[10px] font-medium">Speed</span>
        <div className="flex gap-0.5">
          {SPEED_OPTS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors
                ${speed === s
                  ? 'bg-accent-cyan text-surface'
                  : 'bg-surface-alt text-text-secondary border border-border-subtle hover:text-text-primary'
                }`}
              aria-label={`Speed: ${s}`}
            >
              {SPEED_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const boardRef = useRef<PlinkoBoardHandle>(null);
  const [ballCount, setBallCount] = useState(0);
  const [showSplash, setShowSplash] = useState(true);
  const reducedMotion = useReducedMotion();

  const dropBall = useCallback((slotIndex: number): number => {
    return boardRef.current?.dropBall(slotIndex) ?? -1;
  }, []);

  const plinko = usePlinko({ onDropBall: dropBall });
  const autoBet = useAutoBet({
    placeBet: plinko.placeBet,
    playing: plinko.playing,
    betPending: plinko.betPending,
    balance: plinko.balance,
    betAmount: plinko.betAmount,
    numBalls: plinko.numBalls,
    error: plinko.error,
  });

  useKeyboardShortcuts({
    placeBet: plinko.placeBet,
    toggleSfx: plinko.toggleSfx,
    isAutoBetting: autoBet.active,
    stopAutoBet: autoBet.stop,
    disabled: plinko.betPending,
    config: plinko.config,
    betAmount: plinko.betAmount,
    setBetAmount: plinko.setBetAmount,
  });

  // Screen reader announcements
  const [srAnnouncement, setSrAnnouncement] = useState('');

  // Auto-clear announcements after 3s
  useEffect(() => {
    if (!srAnnouncement) return;
    const timer = setTimeout(() => setSrAnnouncement(''), 3000);
    return () => clearTimeout(timer);
  }, [srAnnouncement]);

  // Watch mute transitions
  const prevSfxMutedRef = useRef(plinko.sfxMuted);
  useEffect(() => {
    if (prevSfxMutedRef.current !== plinko.sfxMuted) {
      setSrAnnouncement(plinko.sfxMuted ? 'Sound effects muted' : 'Sound effects unmuted');
    }
    prevSfxMutedRef.current = plinko.sfxMuted;
  }, [plinko.sfxMuted]);

  // Watch auto-bet transitions
  const prevAutoBetRef = useRef(autoBet.active);
  useEffect(() => {
    if (prevAutoBetRef.current !== autoBet.active) {
      setSrAnnouncement(autoBet.active ? 'Auto-bet started' : 'Auto-bet stopped');
    }
    prevAutoBetRef.current = autoBet.active;
  }, [autoBet.active]);

  // Auto-clear transient errors
  useEffect(() => {
    if (plinko.error && isTransientError(plinko.error)) {
      const timer = setTimeout(() => plinko.clearError(), 5000);
      return () => clearTimeout(timer);
    }
  }, [plinko.error, plinko.clearError]);

  // Stop auto-bet on reset
  const handleResetBalance = useCallback(() => {
    autoBet.stop();
    plinko.resetBalance();
  }, [autoBet.stop, plinko.resetBalance]);

  if (plinko.loading) return <LoadingScreen />;
  if (!plinko.config && plinko.error) return <ErrorScreen error={plinko.error} />;

  return (
    <>
      <Layout
        header={
          <header className="h-14 flex items-center px-4 border-b border-border-subtle">
            <h1 className="text-accent-cyan font-bold text-lg font-heading">
              PlinkoVibe
            </h1>
            {autoBet.active && (
              <span className="text-accent-red text-xs font-bold animate-pulse ml-2">AUTO</span>
            )}
            <div className="ml-auto flex items-center gap-1">
              <HotkeysHint />
              <MuteButton
                musicMuted={plinko.musicMuted}
                sfxMuted={plinko.sfxMuted}
                onToggleMusic={plinko.toggleMusic}
                onToggleSfx={plinko.toggleSfx}
              />
            </div>
          </header>
        }
        renderControls={() => (
          <ControlsPanel
            betAmount={plinko.betAmount}
            setBetAmount={plinko.setBetAmount}
            numBalls={plinko.numBalls}
            setNumBalls={plinko.setNumBalls}
            rows={plinko.rows}
            setRows={plinko.setRows}
            riskLevel={plinko.riskLevel}
            setRiskLevel={plinko.setRiskLevel}
            speed={plinko.speed}
            setSpeed={plinko.setSpeed}
            balance={plinko.balance}
            playing={plinko.playing}
            betPending={plinko.betPending}
            config={plinko.config}
            error={plinko.error}
            clearError={plinko.clearError}
            placeBet={plinko.placeBet}
            autoBetActive={autoBet.active}
            autoBetRoundsCompleted={autoBet.roundsCompleted}
            autoBetConfig={autoBet.config}
            onAutoBetConfigChange={autoBet.setConfig}
            onAutoBetToggle={autoBet.toggle}
            autoBetStopReason={autoBet.stopReason}
            activeBallCount={ballCount}
          />
        )}
        board={
          <MobileSpeedOverlay speed={plinko.speed} setSpeed={plinko.setSpeed}>
            <PlinkoBoard
              ref={boardRef}
              rows={plinko.rows}
              speed={plinko.speed}
              multipliers={plinko.currentMultipliers ?? undefined}
              onBallLanded={plinko.handleBallLanded}
              onBallCountChange={setBallCount}
              reducedMotion={reducedMotion}
              muted={plinko.sfxMuted}
            />
          </MobileSpeedOverlay>
        }
        renderStats={() => (
          <StatsPanel
            balance={plinko.balance}
            lastResults={plinko.lastResults}
            totalWagered={plinko.totalWagered}
            totalWon={plinko.totalWon}
            sessionStartTime={plinko.sessionStartTime}
            resetBalance={handleResetBalance}
          />
        )}
        autoBetActive={autoBet.active}
        autoBetRoundsCompleted={autoBet.roundsCompleted}
        onStopAutoBet={autoBet.stop}
      />
      {showSplash && (
        <SplashScreen onDismiss={() => {
          setShowSplash(false);
          ensureAudioResumed();
          if (!plinko.musicMuted) startBackgroundMusic();
        }} />
      )}
      <div aria-live="assertive" className="sr-only">{srAnnouncement}</div>
    </>
  );
}
