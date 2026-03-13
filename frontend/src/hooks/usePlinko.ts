import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { RowCount, RiskLevel, BetResult, ConfigResponse } from '@plinko-v2/shared';
import type { SpeedPreset } from '@/plinko/playback';
import * as api from '@/api';

const MAX_BET_COUNT = 100;

const BALL_DROP_DELAY: Record<SpeedPreset, number> = {
  slow: 700,
  regular: 400,
  turbo: 200,
};

const PLAY_TIMEOUT_MS = 30_000;

interface UsePlinkoOptions {
  onDropBall: (slotIndex: number) => number;
}

interface UsePlinkoReturn {
  sessionId: string | null;
  balance: number;
  config: ConfigResponse | null;
  loading: boolean;
  error: string | null;
  clearError: () => void;

  betAmount: number;
  setBetAmount: (amount: number) => void;
  numBalls: number;
  setNumBalls: (n: number) => void;
  rows: RowCount;
  setRows: (r: RowCount) => void;
  riskLevel: RiskLevel;
  setRiskLevel: (r: RiskLevel) => void;
  speed: SpeedPreset;
  setSpeed: (s: SpeedPreset) => void;

  playing: boolean;
  betPending: boolean;
  currentMultipliers: number[] | null;

  placeBet: () => void;
  resetBalance: () => void;
  handleBallLanded: (dropId: number, slotIndex: number) => void;

  lastResults: BetResult[];
}

export function usePlinko(options: UsePlinkoOptions): UsePlinkoReturn {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [betAmount, setBetAmount] = useState(1);
  const [numBalls, setNumBalls] = useState(1);
  const [rows, setRows] = useState<RowCount>(10);
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('medium');
  const [speed, setSpeed] = useState<SpeedPreset>('regular');

  const [playing, setPlaying] = useState(false);
  const [betPending, setBetPending] = useState(false);
  const [lastResults, setLastResults] = useState<BetResult[]>([]);

  const onDropBallRef = useRef(options.onDropBall);
  useEffect(() => { onDropBallRef.current = options.onDropBall; });

  const dropIdToResultRef = useRef(new Map<number, { result: BetResult; index: number }>());
  const pendingCountRef = useRef(0);
  const completedCountRef = useRef(0);
  const highestBalanceIdxRef = useRef(-1);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // ---- Initialization ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await api.ensureSession();
        if (cancelled) return;
        setSessionId(session.sessionId);
        setBalance(session.balance);

        const cfg = await api.getConfig(session.sessionId);
        if (cancelled) return;
        setConfig(cfg);
        setRows(cfg.defaultRows);
        setRiskLevel(cfg.defaultRisk);
        setBetAmount(cfg.minBet);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to initialize');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ---- Derived: currentMultipliers ----
  const currentMultipliers = useMemo(() => {
    if (!config) return null;
    const key = `${rows}_${riskLevel}`;
    const pt = config.paytables[key];
    return pt?.multipliers ?? null;
  }, [config, rows, riskLevel]);

  // ---- Place bet ----
  const placeBet = useCallback(async () => {
    if (!sessionId || !config || playing || betPending) return;

    const count = Math.max(1, Math.min(MAX_BET_COUNT, Math.floor(numBalls)));
    const totalCost = betAmount * count;

    if (balance < totalCost) {
      setError('Insufficient balance');
      return;
    }
    if (betAmount < config.minBet || betAmount > config.maxBet) {
      setError(`Bet must be between $${config.minBet} and $${config.maxBet}`);
      return;
    }

    setError(null);
    setBetPending(true);

    // Optimistic balance deduction
    setBalance(prev => prev - totalCost);

    try {
      const { bets } = await api.placeBet({
        sessionId,
        betAmount,
        rows,
        riskLevel,
        count,
      });

      setBetPending(false);
      setPlaying(true);
      pendingCountRef.current = bets.length;
      completedCountRef.current = 0;
      highestBalanceIdxRef.current = -1;

      // Stagger ball drops
      const dropDelay = BALL_DROP_DELAY[speed];
      for (let i = 0; i < bets.length; i++) {
        const result = bets[i];
        const betIndex = i;
        setTimeout(() => {
          const dropId = onDropBallRef.current(result.slotIndex);
          dropIdToResultRef.current.set(dropId, { result, index: betIndex });
        }, i * dropDelay);
      }

      // Safety timeout
      playTimeoutRef.current = setTimeout(() => {
        setPlaying(false);
        pendingCountRef.current = 0;
      }, PLAY_TIMEOUT_MS);

    } catch (e) {
      // Revert optimistic deduction
      setBalance(prev => prev + totalCost);
      setError(e instanceof Error ? e.message : 'Bet failed');
      setBetPending(false);
      setPlaying(false);
    }
  }, [sessionId, config, playing, betPending, betAmount, numBalls, balance, rows, riskLevel, speed]);

  // ---- Ball landing handler ----
  const handleBallLanded = useCallback((dropId: number, _slotIndex: number) => {
    const entry = dropIdToResultRef.current.get(dropId);
    if (entry) {
      const { result, index } = entry;

      if (index > highestBalanceIdxRef.current) {
        highestBalanceIdxRef.current = index;
        setBalance(result.balance);
      }

      setLastResults(prev => [result, ...prev].slice(0, 100));
      dropIdToResultRef.current.delete(dropId);
    }

    completedCountRef.current += 1;
    if (completedCountRef.current >= pendingCountRef.current) {
      setPlaying(false);
      pendingCountRef.current = 0;
      completedCountRef.current = 0;
      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
        playTimeoutRef.current = null;
      }
    }
  }, []);

  // ---- Reset balance ----
  const resetBalance = useCallback(async () => {
    const oldSessionId = sessionId;
    try {
      setLoading(true);
      setError(null);
      const session = await api.createSession();
      api.storeSessionId(session.sessionId);
      setSessionId(session.sessionId);
      setBalance(session.balance);
      setLastResults([]);
    } catch (e) {
      if (oldSessionId) api.storeSessionId(oldSessionId);
      setError(e instanceof Error ? e.message : 'Failed to create new game. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  return {
    sessionId,
    balance,
    config,
    loading,
    error,
    clearError,

    betAmount,
    setBetAmount,
    numBalls,
    setNumBalls,
    rows,
    setRows,
    riskLevel,
    setRiskLevel,
    speed,
    setSpeed,

    playing,
    betPending,
    currentMultipliers,

    placeBet,
    resetBalance,
    handleBallLanded,

    lastResults,
  };
}
