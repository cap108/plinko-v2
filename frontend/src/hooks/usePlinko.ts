import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { RowCount, RiskLevel, BetResult, ConfigResponse } from '@plinko-v2/shared';
import type { SpeedPreset } from '@/plinko/playback';
import * as api from '@/api';
import { ensureAudioResumed, setBgmMuted } from '@/sound/audioContext';

const STORAGE_MUSIC = 'plinko_music_muted';
const STORAGE_SFX = 'plinko_sfx_muted';
const STORAGE_ROWS = 'plinko_rows';
const STORAGE_RISK = 'plinko_risk';
const STORAGE_SPEED = 'plinko_speed';
const STORAGE_BET = 'plinko_bet';
const STORAGE_BALLS = 'plinko_balls';

function getStoredBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* ignore */ }
  return fallback;
}

function setStoredBool(key: string, value: boolean): void {
  try { localStorage.setItem(key, value ? '1' : '0'); } catch { /* ignore */ }
}

function getStored(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function setStored(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

const MAX_BET_COUNT = 100;

const BALL_DROP_DELAY: Record<SpeedPreset, number> = {
  slow: 700,
  regular: 400,
  turbo: 200,
};

interface UsePlinkoOptions {
  onDropBall: (slotIndex: number) => number;
}

type DropEntry = { result: BetResult; globalIndex: number };

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

  musicMuted: boolean;
  sfxMuted: boolean;
  toggleMusic: () => void;
  toggleSfx: () => void;

  totalWagered: number;
  totalWon: number;
  sessionStartTime: number;
}

export function usePlinko(options: UsePlinkoOptions): UsePlinkoReturn {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [betAmount, setBetAmountRaw] = useState(() => {
    const v = getStored(STORAGE_BET);
    return v ? parseFloat(v) || 1 : 1;
  });
  const [numBalls, setNumBallsRaw] = useState(() => {
    const v = getStored(STORAGE_BALLS);
    return v ? Math.max(1, Math.min(MAX_BET_COUNT, parseInt(v, 10) || 1)) : 1;
  });
  const [rows, setRowsRaw] = useState<RowCount>(() => {
    const v = getStored(STORAGE_ROWS);
    const n = v ? parseInt(v, 10) : 0;
    return ([8, 10, 12, 14, 16] as number[]).includes(n) ? (n as RowCount) : 10;
  });
  const [riskLevel, setRiskLevelRaw] = useState<RiskLevel>(() => {
    const v = getStored(STORAGE_RISK);
    return v && ['low', 'medium', 'high'].includes(v) ? (v as RiskLevel) : 'medium';
  });
  const [speed, setSpeedRaw] = useState<SpeedPreset>(() => {
    const v = getStored(STORAGE_SPEED);
    return v && ['slow', 'regular', 'turbo'].includes(v) ? (v as SpeedPreset) : 'regular';
  });

  // Wrapped setters that persist to localStorage
  const setBetAmount = useCallback((v: number) => {
    setBetAmountRaw(v);
    setStored(STORAGE_BET, String(v));
  }, []);
  const setNumBalls = useCallback((v: number) => {
    setNumBallsRaw(v);
    setStored(STORAGE_BALLS, String(v));
  }, []);
  const setRows = useCallback((v: RowCount) => {
    setRowsRaw(v);
    setStored(STORAGE_ROWS, String(v));
  }, []);
  const setRiskLevel = useCallback((v: RiskLevel) => {
    setRiskLevelRaw(v);
    setStored(STORAGE_RISK, v);
  }, []);
  const setSpeed = useCallback((v: SpeedPreset) => {
    setSpeedRaw(v);
    setStored(STORAGE_SPEED, v);
  }, []);

  const [playing, setPlaying] = useState(false);
  const [betPending, setBetPending] = useState(false);
  const [lastResults, setLastResults] = useState<BetResult[]>([]);
  const [musicMuted, setMusicMuted] = useState(() => getStoredBool(STORAGE_MUSIC, false));
  const [sfxMuted, setSfxMuted] = useState(() => getStoredBool(STORAGE_SFX, false));

  // Phase 5 stats
  const [totalWagered, setTotalWagered] = useState(0);
  const [totalWon, setTotalWon] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState(Date.now());

  const toggleMusic = useCallback(() => {
    setMusicMuted(prev => {
      const next = !prev;
      setStoredBool(STORAGE_MUSIC, next);
      setBgmMuted(next);
      if (!next) ensureAudioResumed();
      return next;
    });
  }, []);

  const toggleSfx = useCallback(() => {
    setSfxMuted(prev => {
      const next = !prev;
      setStoredBool(STORAGE_SFX, next);
      if (!next) ensureAudioResumed();
      return next;
    });
  }, []);

  const onDropBallRef = useRef(options.onDropBall);
  useEffect(() => { onDropBallRef.current = options.onDropBall; });

  // Phase 5: Replace pendingCountRef/completedCountRef/highestBalanceIdxRef
  const activeBallsRef = useRef(0);
  const dropIdToResultRef = useRef(new Map<number, DropEntry>());
  const globalBetIndexRef = useRef(0);
  const latestBalanceIndexRef = useRef(-1);

  // Phase 5: Inflight cost tracking + throttle + session generation
  const inflightCostRef = useRef(0);
  const lastBetTimeRef = useRef(0);
  const sessionGenRef = useRef(0);

  // Phase 5: Per-round net tracking for auto-bet "stop on win"
  const roundNetRef = useRef(0);

  // Phase 5: Safety timeout - last activity time
  const lastActivityTimeRef = useRef(0);

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
        // Only apply server defaults if no stored preference exists
        if (!getStored(STORAGE_ROWS)) setRows(cfg.defaultRows);
        if (!getStored(STORAGE_RISK)) setRiskLevel(cfg.defaultRisk);
        if (!getStored(STORAGE_BET)) setBetAmount(cfg.minBet);
        // Clamp stored bet to server limits
        setBetAmountRaw(prev => {
          const clamped = Math.max(cfg.minBet, Math.min(cfg.maxBet, prev));
          setStored(STORAGE_BET, String(clamped));
          return clamped;
        });
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

  // ---- Place bet (rapid-fire enabled: playing guard removed) ----
  const placeBet = useCallback(async () => {
    // Unified 300ms throttle — covers keyboard, button clicks, auto-bet
    const now = Date.now();
    if (now - lastBetTimeRef.current < 300) return;
    lastBetTimeRef.current = now;

    if (!sessionId || !config || betPending) return;

    if (config.maintenanceMode) {
      setError('Game is temporarily paused for maintenance');
      return;
    }

    ensureAudioResumed();

    const count = Math.max(1, Math.min(MAX_BET_COUNT, Math.floor(numBalls)));
    const totalCost = betAmount * count;

    // Synchronous balance guard with inflight cost tracking
    const availableBalance = balance - inflightCostRef.current;
    if (availableBalance < totalCost) {
      setError('Insufficient balance');
      return;
    }
    inflightCostRef.current += totalCost;
    const currentGen = sessionGenRef.current;

    if (betAmount < config.minBet || betAmount > config.maxBet) {
      setError(`Bet must be between $${config.minBet} and $${config.maxBet}`);
      inflightCostRef.current = Math.max(0, inflightCostRef.current - totalCost);
      return;
    }

    // Per-round net tracking
    roundNetRef.current = -totalCost;

    setError(null);
    setBetPending(true);

    // Optimistic balance deduction + stat tracking
    setBalance(prev => prev - totalCost);
    setTotalWagered(prev => prev + totalCost);

    try {
      const { bets } = await api.placeBet({
        sessionId,
        betAmount,
        rows,
        riskLevel,
        count,
      });

      // Guard against stale callback from pre-resetBalance API call
      if (currentGen !== sessionGenRef.current) return;

      inflightCostRef.current = Math.max(0, inflightCostRef.current - totalCost);

      setBetPending(false);
      activeBallsRef.current += bets.length;
      setPlaying(true);
      lastActivityTimeRef.current = Date.now();

      // Stagger ball drops with global index
      const dropDelay = BALL_DROP_DELAY[speed];
      for (let i = 0; i < bets.length; i++) {
        const result = bets[i];
        const globalIdx = globalBetIndexRef.current++;
        setTimeout(() => {
          const dropId = onDropBallRef.current(result.slotIndex);
          dropIdToResultRef.current.set(dropId, { result, globalIndex: globalIdx });
        }, i * dropDelay);
      }

    } catch (e) {
      if (currentGen !== sessionGenRef.current) return;
      inflightCostRef.current = Math.max(0, inflightCostRef.current - totalCost);
      // Revert optimistic deduction
      setBalance(prev => prev + totalCost);
      setTotalWagered(prev => prev - totalCost);
      setError(e instanceof Error ? e.message : 'Bet failed');
      setBetPending(false);
    }
  }, [sessionId, config, betPending, betAmount, numBalls, balance, rows, riskLevel, speed]);

  // ---- Ball landing handler ----
  const handleBallLanded = useCallback((dropId: number, _slotIndex: number) => {
    lastActivityTimeRef.current = Date.now();

    const entry = dropIdToResultRef.current.get(dropId);
    if (entry) {
      const { result, globalIndex } = entry;

      // Add this ball's net win to the optimistic balance.
      // We already deducted the full batch cost upfront, so each ball's
      // contribution is just its winAmount. This avoids the display
      // bouncing when server running-balance goes down between balls.
      setBalance(prev => prev + result.winAmount);
      latestBalanceIndexRef.current = Math.max(latestBalanceIndexRef.current, globalIndex);

      setTotalWon(prev => prev + result.winAmount);
      roundNetRef.current += result.winAmount;
      setLastResults(prev => [result, ...prev].slice(0, 100));
      dropIdToResultRef.current.delete(dropId);
    }

    activeBallsRef.current -= 1;
    if (activeBallsRef.current <= 0) {
      activeBallsRef.current = 0;
      setPlaying(false);
    }
  }, []);

  // ---- Safety timeout: periodic stuck-ball check ----
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeBallsRef.current > 0 && lastActivityTimeRef.current > 0) {
        if (Date.now() - lastActivityTimeRef.current > 30_000) {
          activeBallsRef.current = 0;
          setPlaying(false);
          lastActivityTimeRef.current = Date.now();
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // ---- Reset balance ----
  const resetBalance = useCallback(async () => {
    const oldSessionId = sessionId;
    try {
      sessionGenRef.current++;
      setLoading(true);
      setError(null);
      const session = await api.createSession();
      api.storeSessionId(session.sessionId);
      setSessionId(session.sessionId);
      setBalance(session.balance);
      setLastResults([]);
      setTotalWagered(0);
      setTotalWon(0);
      setSessionStartTime(Date.now());
      latestBalanceIndexRef.current = -1;
      globalBetIndexRef.current = 0;
      inflightCostRef.current = 0;
      roundNetRef.current = 0;
      activeBallsRef.current = 0;
      lastActivityTimeRef.current = 0;
      dropIdToResultRef.current.clear();
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

    musicMuted,
    sfxMuted,
    toggleMusic,
    toggleSfx,

    totalWagered,
    totalWon,
    sessionStartTime,
  };
}
