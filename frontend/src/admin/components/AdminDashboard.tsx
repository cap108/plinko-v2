import { useState, useRef } from 'react';
import { ConfigTab } from './ConfigTab';
import { SessionsTab } from './SessionsTab';
import { AnalyticsTab } from './AnalyticsTab';

interface AdminDashboardProps {
  onLogout: () => void;
}

const TABS = ['Config', 'Sessions', 'Analytics'] as const;
type TabId = (typeof TABS)[number];

export function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabId>('Config');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let nextIdx = idx;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + TABS.length) % TABS.length;
    else return;
    e.preventDefault();
    setActiveTab(TABS[nextIdx]);
    tabRefs.current[nextIdx]?.focus();
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header */}
      <header className="shrink-0 bg-surface-alt border-b border-amber-500/20">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <h1 className="text-amber-500 font-heading text-base tracking-wider">PlinkoVibe Admin</h1>
          </div>
          <button
            onClick={onLogout}
            className="text-text-secondary hover:text-red-400 text-xs font-medium uppercase tracking-wider transition-colors
                       px-3 py-1.5 rounded border border-transparent hover:border-red-400/30"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="shrink-0 bg-surface-alt/50 border-b border-border-subtle">
        <div className="max-w-6xl mx-auto px-4">
          <div
            role="tablist"
            aria-label="Admin sections"
            className="flex gap-0"
          >
            {TABS.map((tab, idx) => (
              <button
                key={tab}
                ref={el => { tabRefs.current[idx] = el; }}
                role="tab"
                id={`admin-tab-${tab}`}
                aria-selected={activeTab === tab}
                aria-controls={`admin-panel-${tab}`}
                tabIndex={activeTab === tab ? 0 : -1}
                onClick={() => setActiveTab(tab)}
                onKeyDown={e => handleTabKeyDown(e, idx)}
                className={`px-5 py-3 text-xs font-semibold uppercase tracking-wider transition-all border-b-2
                  ${activeTab === tab
                    ? 'border-amber-500 text-amber-500'
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border-subtle'
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div
            role="tabpanel"
            id={`admin-panel-Config`}
            aria-labelledby={`admin-tab-Config`}
            hidden={activeTab !== 'Config'}
          >
            {activeTab === 'Config' && <ConfigTab />}
          </div>
          <div
            role="tabpanel"
            id={`admin-panel-Sessions`}
            aria-labelledby={`admin-tab-Sessions`}
            hidden={activeTab !== 'Sessions'}
          >
            {activeTab === 'Sessions' && <SessionsTab />}
          </div>
          <div
            role="tabpanel"
            id={`admin-panel-Analytics`}
            aria-labelledby={`admin-tab-Analytics`}
            hidden={activeTab !== 'Analytics'}
          >
            {activeTab === 'Analytics' && <AnalyticsTab />}
          </div>
        </div>
      </div>

      {/* Live region for status */}
      <div aria-live="polite" className="sr-only" id="admin-status" />
    </div>
  );
}
