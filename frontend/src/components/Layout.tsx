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
      {header}
      {config?.maintenanceMode && (
        <div className="shrink-0 bg-orange-600/90 text-white text-center py-2 text-sm font-bold"
             role="status">
          Game is temporarily paused for maintenance
        </div>
      )}

      {/* Desktop layout */}
      <main className="hidden lg:flex flex-1 flex-row overflow-hidden min-h-0">
        <aside className="flex w-72 border-r border-border-subtle p-4 flex-col gap-4 overflow-y-auto">
          {renderControls()}
        </aside>

        <div className="flex-1 flex items-center justify-center p-4 min-h-0 overflow-hidden">
          <div className="w-full max-w-lg aspect-[3/4]">
            {board}
          </div>
        </div>

        <aside className="flex flex-col w-72 border-l border-border-subtle p-4 overflow-hidden">
          {renderStats()}
        </aside>
      </main>

      {/* Mobile layout — board on top, controls below, all in one scroll flow */}
      <div className="flex-1 flex flex-col lg:hidden overflow-hidden min-h-0">
        {/* Board — takes ~50% of available space */}
        <div className="shrink-0 flex items-start justify-center px-1" style={{ height: '48%' }}>
          <div className="w-full h-full max-w-lg">
            {board}
          </div>
        </div>

        {/* Auto-bet status bar */}
        {autoBetActive && (
          <div className="flex items-center justify-between px-3 py-1 bg-accent-red/10 border-y border-border-subtle shrink-0">
            <span className="text-accent-red text-xs font-medium animate-pulse">
              Auto ({autoBetRoundsCompleted} rounds)
            </span>
            <button
              onClick={onStopAutoBet}
              className="px-3 py-1 bg-accent-red text-white text-xs font-bold rounded min-h-[36px] min-w-[36px]"
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
          className="flex-1 px-3 py-2 overflow-y-auto min-h-0"
          hidden={mobileTab !== 'controls'}
        >
          {renderControls()}
        </div>
        <div
          id="tabpanel-stats"
          role="tabpanel"
          aria-labelledby="tab-stats"
          className="flex-1 px-3 py-2 overflow-y-auto min-h-0"
          hidden={mobileTab !== 'stats'}
        >
          {renderStats()}
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
      className={`flex-1 py-1.5 text-center text-xs lg:text-sm font-medium transition-colors min-h-[36px]
        ${active
          ? 'border-b-2 border-accent-cyan text-accent-cyan'
          : 'text-text-secondary hover:text-text-primary'
        }`}
    >
      {label}
    </button>
  );
}
