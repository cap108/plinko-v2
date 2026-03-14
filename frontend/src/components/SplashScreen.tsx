import { useRef, useEffect } from 'react';

interface SplashScreenProps {
  onDismiss: () => void;
}

export function SplashScreen({ onDismiss }: SplashScreenProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { buttonRef.current?.focus(); }, []);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="splash-heading"
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface/95 backdrop-blur-sm">
      <div className="max-w-[600px] w-[90vw] rounded-2xl border border-accent-cyan/30 bg-surface p-8
        shadow-[0_0_40px_rgba(0,229,255,0.15),inset_0_0_20px_rgba(0,229,255,0.05)]">
        <h2 id="splash-heading" className="text-center font-heading text-[clamp(2rem,6vw,3.5rem)] font-bold text-accent-cyan
          drop-shadow-[0_0_20px_rgba(0,229,255,0.5)] mb-8">
          PlinkoVibe
        </h2>

        <div className="rounded-xl border border-border-subtle bg-surface-alt/50 p-6 mb-8">
          <h2 className="text-center text-text-primary font-heading text-xl mb-5">How to Play</h2>
          <ul className="space-y-4">
            {[
              { n: '1', text: <><strong className="text-text-primary">Set your bet</strong> and choose the number of balls to drop.</> },
              { n: '2', text: <><strong className="text-text-primary">Adjust Risk & Rows</strong> to change the multiplier distribution. Higher risk means bigger potential wins, but more chance of missing!</> },
              { n: '3', text: <><strong className="text-text-primary">Hit Spin</strong> to release the balls and watch them bounce through the pegs.</> },
              { n: '4', text: <><strong className="text-text-primary">Win multipliers</strong> based on which slot the balls land in at the bottom!</> },
              { n: '5', text: <><strong className="text-text-primary">Enable Auto Bet</strong> to run multiple rounds with custom stop conditions</> },
            ].map(({ n, text }) => (
              <li key={n} className="flex items-start gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-accent-cyan text-surface
                  flex items-center justify-center text-sm font-bold">{n}</span>
                <p className="text-text-secondary text-sm leading-relaxed">{text}</p>
              </li>
            ))}
          </ul>
          <p className="text-text-secondary text-xs mt-4 hidden md:block">
            Keyboard: Space = bet, +/- = adjust amount, M = mute
          </p>
        </div>

        <button
          ref={buttonRef}
          onClick={onDismiss}
          className="w-full py-4 rounded-xl bg-accent-cyan text-surface font-bold text-lg
            hover:brightness-110 transition-all min-h-[56px]
            focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          LET'S PLAY!
        </button>
      </div>
    </div>
  );
}
