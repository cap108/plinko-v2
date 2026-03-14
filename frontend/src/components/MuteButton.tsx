import { useState, useRef, useEffect } from 'react';
import { getBgmVolume, setBgmVolume } from '@/sound/audioContext';

interface MuteButtonProps {
  musicMuted: boolean;
  sfxMuted: boolean;
  onToggleMusic: () => void;
  onToggleSfx: () => void;
}

export function MuteButton({ musicMuted, sfxMuted, onToggleMusic, onToggleSfx }: MuteButtonProps) {
  const [open, setOpen] = useState(false);
  const [bgmVol, setBgmVol] = useState(getBgmVolume);
  const ref = useRef<HTMLDivElement>(null);

  const allMuted = musicMuted && sfxMuted;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center text-text-secondary
          hover:text-text-primary transition-colors
          focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded"
        aria-label="Audio settings"
      >
        {allMuted ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-border-subtle
          bg-surface shadow-lg p-3 space-y-3 z-40">
          <div className="flex items-center justify-between">
            <span className="text-text-secondary text-sm">Music</span>
            <button
              onClick={onToggleMusic}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                musicMuted
                  ? 'bg-surface-alt text-text-secondary'
                  : 'bg-accent-cyan text-surface'
              }`}
            >
              {musicMuted ? 'Off' : 'On'}
            </button>
          </div>

          {!musicMuted && (
            <div>
              <label className="text-text-secondary text-xs">Volume</label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(bgmVol * 100)}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100;
                  setBgmVol(v);
                  setBgmVolume(v);
                }}
                className="w-full"
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-text-secondary text-sm">Sound Effects</span>
            <button
              onClick={onToggleSfx}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                sfxMuted
                  ? 'bg-surface-alt text-text-secondary'
                  : 'bg-accent-cyan text-surface'
              }`}
            >
              {sfxMuted ? 'Off' : 'On'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
