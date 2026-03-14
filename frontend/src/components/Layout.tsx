import { useState } from 'react';
import type { ConfigResponse } from '@plinko-v2/shared';

interface LayoutProps {
  header: React.ReactNode;
  renderControls: () => React.ReactNode;
  renderStats: () => React.ReactNode;
  board: React.ReactNode;
  config?: ConfigResponse | null;
  // Auto-bet status bar (mobile)
  autoBetActive: boolean;
  autoBetRoundsCompleted: number;
  onStopAutoBet: () => void;
}

export function Layout({
  header, renderControls, renderStats, board, config,
  autoBetActive, autoBetRoundsCompleted, onStopAutoBet,
}: LayoutProps) {
  const [mobileTab, setMobileTab] = useState<'controls' | 'stats'>('controls');

  return (
    <div className="h-[100dvh] flex flex-col bg-surface overflow-hidden">
      <a
        href="#plinko-board"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2
          focus:px-4 focus:py-2 focus:bg-accent-cyan focus:text-surface focus:rounded focus:font-bold focus:text-sm"
      >
        Skip to game board
      </a>
      {header}
      {config?.maintenanceMode && (
        <div className="shrink-0 bg-orange-600/90 text-white text-center py-2 text-sm font-bold"
             role="status">
          Game is temporarily paused for maintenance
        </div>
      )}

      {/* Unified layout: single flex container, responsive via Tailwind */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left sidebar — desktop only */}
        <aside className="hidden lg:flex w-72 border-r border-border-subtle p-4 flex-col gap-4 overflow-y-auto shrink-0">
          {renderControls()}
        </aside>

        {/* Center: board (rendered ONCE — critical for PixiJS canvas + ref) */}
        <div className="
          shrink-0 lg:shrink lg:flex-1
          flex items-start lg:items-center justify-center
          px-1 lg:p-4
          h-[44%] lg:h-auto
          lg:min-h-0 lg:overflow-hidden
        ">
          <div className="w-full h-full max-w-4xl mx-auto">
            {board}
          </div>
        </div>

        {/* Right sidebar — desktop only */}
        <aside className="hidden lg:flex flex-col w-72 border-l border-border-subtle p-4 overflow-hidden shrink-0">
          {renderStats()}
        </aside>

        {/* Mobile below-board area */}
        <div className="flex-1 flex flex-col lg:hidden overflow-hidden min-h-0">
          {/* Auto-bet status bar */}
          {autoBetActive && (
            <div className="flex items-center justify-between px-3 py-1 bg-accent-red/10 border-y border-border-subtle shrink-0">
              <span className="text-accent-red text-xs font-medium animate-pulse">
                Auto ({autoBetRoundsCompleted} rounds)
              </span>
              <button
                onClick={onStopAutoBet}
                className="px-3 py-1 bg-accent-red text-white text-xs font-bold rounded min-h-[44px] min-w-[44px]"
              >
                STOP
              </button>
            </div>
          )}

          {/* Tab toggle */}
          <div
            className="flex border-y border-border-subtle shrink-0"
            role="tablist"
            aria-label="Game panels"
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                const next = mobileTab === 'controls' ? 'stats' : 'controls';
                setMobileTab(next);
                document.getElementById(`tab-${next}`)?.focus();
              }
            }}
          >
            <TabButton
              id="tab-controls"
              active={mobileTab === 'controls'}
              onClick={() => setMobileTab('controls')}
              label="Play"
              controls="tabpanel-controls"
            />
            <TabButton
              id="tab-stats"
              active={mobileTab === 'stats'}
              onClick={() => setMobileTab('stats')}
              label="Stats"
              controls="tabpanel-stats"
            />
          </div>

          {/* Tab content — fills remaining space, scrollable */}
          <div
            id="tabpanel-controls"
            role="tabpanel"
            aria-labelledby="tab-controls"
            className="flex-1 px-3 py-2 pb-16 overflow-y-auto min-h-0"
            hidden={mobileTab !== 'controls'}
          >
            {renderControls()}
          </div>
          <div
            id="tabpanel-stats"
            role="tabpanel"
            aria-labelledby="tab-stats"
            className="flex-1 px-3 py-2 pb-16 overflow-y-auto min-h-0"
            hidden={mobileTab !== 'stats'}
          >
            {renderStats()}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({ id, active, onClick, label, controls }: {
  id: string;
  active: boolean;
  onClick: () => void;
  label: string;
  controls: string;
}) {
  return (
    <button
      id={id}
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={`flex-1 py-1.5 text-center text-xs lg:text-sm font-medium transition-colors min-h-[44px]
        ${active
          ? 'border-b-2 border-accent-cyan text-accent-cyan'
          : 'text-text-secondary hover:text-text-primary'
        }`}
    >
      {label}
    </button>
  );
}
