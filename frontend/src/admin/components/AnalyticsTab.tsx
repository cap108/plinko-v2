import { useState, useEffect, useCallback } from 'react';
import type { AdminStatsResponse, AdminRtpReportResponse } from '@plinko-v2/shared';
import * as adminApi from '../adminApi';
import { useToast } from './Toast';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function deviationColor(dev: number): string {
  const abs = Math.abs(dev);
  if (abs <= 1) return 'text-text-primary';
  if (abs <= 3) return 'text-yellow-400';
  return 'text-red-400';
}

interface RtpRow {
  key: string;
  configured: number;
  observed: number;
  deviation: number;
  sampleSize: number;
}

export function AnalyticsTab() {
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [rtpData, setRtpData] = useState<AdminRtpReportResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const { toasts, addToast, removeToast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([adminApi.getStats(), adminApi.getRtpReport()]);
      setStats(s);
      setRtpData(r);
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to load analytics', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Build RTP comparison table
  const rtpRows: RtpRow[] = [];
  if (rtpData) {
    for (const key of Object.keys(rtpData.configured)) {
      const configured = rtpData.configured[key] * 100;
      const obs = rtpData.observed[key];
      const observed = obs ? obs.rtp * 100 : 0;
      const sampleSize = obs?.sampleSize ?? 0;
      const deviation = sampleSize > 0 ? observed - configured : 0;
      rtpRows.push({ key, configured, observed, deviation, sampleSize });
    }
    // Sort by absolute deviation descending
    rtpRows.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
  }

  if (loading) return <AnalyticsSkeleton />;

  return (
    <div>
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm" aria-live="polite">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`px-4 py-2.5 rounded border text-sm font-medium shadow-lg
              ${t.type === 'error' ? 'bg-red-500/15 border-red-500/30 text-red-400' : 'bg-green-500/15 border-green-500/30 text-green-400'}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span>{t.message}</span>
              <button onClick={() => removeToast(t.id)} className="text-text-secondary hover:text-text-primary text-xs">&times;</button>
            </div>
          </div>
        ))}
      </div>

      {/* Stats Cards */}
      <section className="mb-8">
        <h2 className="text-text-primary text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
          Overview
        </h2>
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatCard label="Total Bets" value={stats.totalBetsAllTime.toLocaleString()} />
            <StatCard label="Total Wagered" value={`$${(stats.totalWageredCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
            <StatCard label="Total Won" value={`$${(stats.totalWonCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />
            <StatCard
              label="House Edge"
              value={`$${(stats.houseEdgeCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              color={stats.houseEdgeCents >= 0 ? 'text-green-400' : 'text-red-400'}
            />
            <StatCard
              label="Observed RTP"
              value={stats.totalWageredCents > 0 ? `${(stats.observedRtp * 100).toFixed(2)}%` : 'N/A'}
            />
            <StatCard label="Active Sessions" value={`${stats.activeSessions} / ${stats.totalSessions}`} />
            <StatCard label="Uptime" value={formatUptime(stats.uptimeSeconds)} />
            <StatCard
              label="Maintenance"
              value={stats.maintenanceMode ? 'ON' : 'OFF'}
              color={stats.maintenanceMode ? 'text-orange-400' : 'text-green-400'}
            />
          </div>
        )}
      </section>

      {/* RTP Comparison */}
      <section>
        <h2 className="text-text-primary text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
          RTP Comparison
        </h2>
        <div className="bg-surface-alt border border-border-subtle rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left text-text-secondary font-medium px-4 py-2.5">Config</th>
                <th className="text-right text-text-secondary font-medium px-4 py-2.5">Configured</th>
                <th className="text-right text-text-secondary font-medium px-4 py-2.5">Observed</th>
                <th className="text-right text-text-secondary font-medium px-4 py-2.5">Deviation</th>
                <th className="text-right text-text-secondary font-medium px-4 py-2.5">Samples</th>
              </tr>
            </thead>
            <tbody>
              {rtpRows.map(row => {
                const lowSample = row.sampleSize < 100;
                return (
                  <tr key={row.key} className={`border-b border-border-subtle/30 ${lowSample ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2 font-mono text-text-primary">
                      {row.key}
                      {lowSample && <span className="ml-1 text-text-secondary">*</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-text-primary">{row.configured.toFixed(2)}%</td>
                    <td className="px-4 py-2 text-right font-mono text-text-primary">
                      {row.sampleSize > 0 ? `${row.observed.toFixed(2)}%` : '-'}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono font-bold ${deviationColor(row.deviation)}`}>
                      {row.sampleSize > 0
                        ? `${row.deviation > 0 ? '+' : ''}${row.deviation.toFixed(2)}%`
                        : '-'
                      }
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-text-secondary">
                      {row.sampleSize.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
              {rtpRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-text-secondary">No RTP data available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-text-secondary/60 text-[10px] mt-2">* Fewer than 100 samples — deviation may not be statistically significant</p>
      </section>

      {/* Refresh */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={fetchData}
          className="px-4 py-2 border border-border-subtle hover:border-amber-500/30 text-text-secondary hover:text-amber-400
                     text-xs font-medium rounded transition-colors"
        >
          Refresh Data
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-surface border border-border-subtle rounded-lg p-4">
      <p className="text-text-secondary text-[10px] font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-bold font-mono ${color ?? 'text-text-primary'}`}>{value}</p>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-surface-alt border border-border-subtle rounded-lg p-4">
            <div className="h-3 w-16 bg-border-subtle rounded animate-pulse mb-2" />
            <div className="h-6 w-24 bg-border-subtle rounded animate-pulse" />
          </div>
        ))}
      </div>
      <div className="bg-surface-alt border border-border-subtle rounded-lg p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 bg-border-subtle rounded animate-pulse mb-2" />
        ))}
      </div>
    </div>
  );
}
