import { useEffect, useRef } from 'react';
import type { ConfigResponse } from '@plinko-v2/shared';

interface UseKeyboardShortcutsOptions {
  placeBet: () => void;
  toggleSfx: () => void;
  isAutoBetting: boolean;
  stopAutoBet: () => void;
  disabled: boolean;
  config: ConfigResponse | null;
  betAmount: number;
  setBetAmount: (n: number) => void;
}

function betStep(amount: number): number {
  if (amount < 1) return 0.1;
  if (amount < 10) return 0.5;
  if (amount < 100) return 5;
  return 50;
}

export function useKeyboardShortcuts(opts: UseKeyboardShortcutsOptions): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Ignore held-down keys
      if (e.repeat) return;

      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const o = optsRef.current;

      switch (e.key) {
        case ' ':
          // preventDefault stops browser from synthesizing a click on focused <button>
          e.preventDefault();
          if (o.isAutoBetting) {
            o.stopAutoBet();
          } else if (!o.disabled) {
            o.placeBet();
          }
          break;

        case '+':
        case '=':
          if (o.isAutoBetting || !o.config) return;
          o.setBetAmount(Math.min(
            o.config.maxBet,
            Math.round((o.betAmount + betStep(o.betAmount)) * 100) / 100
          ));
          break;

        case '-':
          if (o.isAutoBetting || !o.config) return;
          o.setBetAmount(Math.max(
            o.config.minBet,
            Math.round((o.betAmount - betStep(o.betAmount)) * 100) / 100
          ));
          break;

        case 'm':
        case 'M':
          o.toggleSfx();
          break;
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
