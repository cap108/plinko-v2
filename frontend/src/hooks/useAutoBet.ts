import { useState, useCallback, useEffect, useRef } from 'react';
import { DEFAULT_AUTO_BET_CONFIG, type AutoBetConfig } from '@/types/autoBet';

interface UseAutoBetOptions {
  placeBet: () => void;
  playing: boolean;
  betPending: boolean;
  balance: number;
  betAmount: number;
  numBalls: number;
  error: string | null;
}

interface UseAutoBetReturn {
  active: boolean;
  config: AutoBetConfig;
  setConfig: (config: AutoBetConfig) => void;
  roundsCompleted: number;
  stopReason: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export function useAutoBet(opts: UseAutoBetOptions): UseAutoBetReturn {
  const [active, setActive] = useState(false);
  const [config, setConfig] = useState<AutoBetConfig>(DEFAULT_AUTO_BET_CONFIG);
  const [roundsCompleted, setRoundsCompleted] = useState(0);
  const [stopReason, setStopReason] = useState<string | null>(null);

  const autoBetStartBalanceRef = useRef(0);
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const roundsRef = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const configRef = useRef(config);
  configRef.current = config;

  const stopWithReason = useCallback((reason?: string) => {
    activeRef.current = false;
    setActive(false);
    roundsRef.current = 0;
    setRoundsCompleted(0);
    if (reason) setStopReason(reason);
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => stopWithReason(), [stopWithReason]);

  const start = useCallback(() => {
    const o = optsRef.current;
    // Refuse to start if currently playing or pending
    if (o.playing || o.betPending) return;
    // Refuse to start if insufficient balance
    if (o.balance < o.betAmount * o.numBalls) return;

    autoBetStartBalanceRef.current = o.balance;
    roundsRef.current = 0;
    setRoundsCompleted(0);
    setStopReason(null);
    activeRef.current = true;
    setActive(true);

    // Fire first bet synchronously
    o.placeBet();
  }, []);

  const toggle = useCallback(() => {
    if (activeRef.current) stop(); else start();
  }, [start, stop]);

  // Watch playing transition: true -> false means a round completed
  const prevPlayingRef = useRef(opts.playing);

  useEffect(() => {
    const wasPlaying = prevPlayingRef.current;
    prevPlayingRef.current = opts.playing;

    if (!activeRef.current) return;

    // Detect round completion: playing -> not playing, not pending
    if (wasPlaying && !opts.playing && !opts.betPending) {
      const o = optsRef.current;
      roundsRef.current += 1;
      const completed = roundsRef.current;
      setRoundsCompleted(completed);

      // Evaluate stop conditions
      const netProfit = o.balance - autoBetStartBalanceRef.current;
      const cfg = configRef.current;

      // Stop on error
      if (o.error) { stopWithReason('Stopped: error occurred'); return; }

      // Stop on max rounds
      if (cfg.maxRounds > 0 && completed >= cfg.maxRounds) {
        stopWithReason(`Stopped: completed ${completed} rounds`); return;
      }

      // Stop on cumulative loss
      if (cfg.stopOnLoss > 0 && netProfit <= -cfg.stopOnLoss) {
        stopWithReason(`Stopped: loss limit reached (-$${Math.abs(netProfit).toFixed(2)})`); return;
      }

      // Stop on cumulative profit
      if (cfg.stopOnProfit > 0 && netProfit >= cfg.stopOnProfit) {
        stopWithReason(`Stopped: profit target reached (+$${netProfit.toFixed(2)})`); return;
      }

      // Check balance sufficient for next round
      if (o.balance < o.betAmount * o.numBalls) {
        stopWithReason('Stopped: insufficient balance'); return;
      }

      // Schedule next bet after 200ms delay
      delayTimerRef.current = setTimeout(() => {
        delayTimerRef.current = null;
        if (!activeRef.current) return;
        optsRef.current.placeBet();
      }, 200);
    }
  }, [opts.playing, opts.betPending, opts.error, stopWithReason]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    };
  }, []);

  return { active, config, setConfig, roundsCompleted, stopReason, start, stop, toggle };
}
