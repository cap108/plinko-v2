import { useState, useEffect, useCallback } from 'react';
import type { AdminSessionDetailResponse } from '@plinko-v2/shared';
import * as adminApi from '../adminApi';
import { ConfirmModal } from './ConfirmModal';
import { useToast } from './Toast';

function absoluteTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatLocation(country?: string | null, region?: string | null): string {
  if (!country) return '—';
  return region ? `${country} / ${region}` : country;
}

interface SessionDetailProps {
  sessionId: string;
  onBack: (filter?: { guestId?: string; ipHash?: string }) => void;
}

export function SessionDetail({ sessionId, onBack }: SessionDetailProps) {
  const [data, setData] = useState<AdminSessionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showReset, setShowReset] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [resetAmount, setResetAmount] = useState('100000');

  const { toasts, addToast, removeToast } = useToast();

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await adminApi.getSessionDetail(sessionId);
      setData(detail);
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to load session', 'error');
    } finally {
      setLoading(false);
    }
  }, [sessionId, addToast]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const handleReset = async () => {
    const cents = parseInt(resetAmount, 10);
    if (isNaN(cents) || cents < 0) return;
    try {
      await adminApi.resetSessionBalance(sessionId, cents);
      addToast('Balance reset', 'success');
      fetchDetail();
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Reset failed', 'error');
    }
    setShowReset(false);
  };

  const handleDelete = async () => {
    try {
      await adminApi.deleteSession(sessionId);
      addToast('Session deleted', 'success');
      onBack();
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Delete failed', 'error');
    }
    setShowDelete(false);
  };

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

      {/* Back button */}
      <button
        onClick={() => onBack()}
        className="flex items-center gap-1.5 text-text-secondary hover:text-amber-400 text-xs font-medium mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Sessions
      </button>

      {loading ? (
        <div className="space-y-4">
          <div className="h-32 bg-surface-alt border border-border-subtle rounded-lg animate-pulse" />
          <div className="h-64 bg-surface-alt border border-border-subtle rounded-lg animate-pulse" />
        </div>
      ) : !data ? (
        <p className="text-red-400 text-sm">Session not found</p>
      ) : (
        <>
          {/* Session info */}
          <div className="bg-surface-alt border border-border-subtle rounded-lg p-5 mb-4">
            <h2 className="text-text-primary text-sm font-semibold mb-4 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
              Session Details
            </h2>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <dt className="text-text-secondary font-medium mb-0.5">Session ID</dt>
                <dd className="text-text-primary font-mono text-[11px] break-all">{data.session.sessionId}</dd>
              </div>
              <div>
                <dt className="text-text-secondary font-medium mb-0.5">Balance</dt>
                <dd className={`font-mono font-bold ${data.session.balanceCents >= 100_000 ? 'text-green-400' : 'text-red-400'}`}>
                  ${(data.session.balanceCents / 100).toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary font-medium mb-0.5">Rounds Played</dt>
                <dd className="text-text-primary font-mono">{data.session.roundCount}</dd>
              </div>
              <div>
                <dt className="text-text-secondary font-medium mb-0.5">Created</dt>
                <dd className="text-text-secondary" title={absoluteTime(data.session.createdAt)}>
                  {relativeTime(data.session.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary font-medium mb-0.5">Last Active</dt>
                <dd className="text-text-secondary" title={absoluteTime(data.session.lastActiveAt)}>
                  {relativeTime(data.session.lastActiveAt)}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary font-medium mb-0.5">Location</dt>
                <dd className="text-text-secondary">
                  {formatLocation(data.session.geoCountry, data.session.geoRegion)}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary font-medium mb-0.5">Browser ID (advisory)</dt>
                <dd className="flex items-center gap-1.5">
                  {data.session.guestId ? (
                    <>
                      <button
                        onClick={() => onBack({ guestId: data.session.guestId! })}
                        className="text-amber-400 hover:text-amber-300 font-mono text-[10px] underline underline-offset-2 transition-colors"
                        title={`Filter sessions by Browser ID: ${data.session.guestId}`}
                      >
                        {data.session.guestId}
                      </button>
                      <span className="text-text-secondary text-[10px]">
                        ({data.guestSessionCount} {data.guestSessionCount === 1 ? 'session' : 'sessions'})
                      </span>
                    </>
                  ) : (
                    <span className="text-text-secondary">—</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-text-secondary font-medium mb-0.5">IP Hash</dt>
                <dd className="flex items-center gap-1.5">
                  {data.session.createdByIpHash ? (
                    <>
                      <button
                        onClick={() => onBack({ ipHash: data.session.createdByIpHash! })}
                        className="text-amber-400 hover:text-amber-300 font-mono text-[10px] underline underline-offset-2 transition-colors"
                        title={`Filter sessions by IP Hash: ${data.session.createdByIpHash}`}
                      >
                        {data.session.createdByIpHash}
                      </button>
                      <span className="text-text-secondary text-[10px]">
                        ({data.ipSessionCount} {data.ipSessionCount === 1 ? 'session' : 'sessions'})
                      </span>
                    </>
                  ) : (
                    <span className="text-text-secondary">N/A</span>
                  )}
                </dd>
              </div>
            </dl>

            {/* Actions */}
            <div className="flex gap-3 mt-5 pt-4 border-t border-border-subtle">
              <button
                onClick={() => setShowReset(true)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded transition-colors"
              >
                Reset Balance
              </button>
              <button
                onClick={() => setShowDelete(true)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded transition-colors"
              >
                Delete Session
              </button>
            </div>
          </div>

          {/* History */}
          <div className="bg-surface-alt border border-border-subtle rounded-lg p-5">
            <h2 className="text-text-primary text-sm font-semibold mb-4 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
              Recent History
              <span className="text-text-secondary font-normal">({data.recentHistory.length})</span>
            </h2>

            {data.recentHistory.length === 0 ? (
              <p className="text-text-secondary text-xs">No history</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      <th className="text-left text-text-secondary font-medium px-2 py-2">Round</th>
                      <th className="text-right text-text-secondary font-medium px-2 py-2">Bet</th>
                      <th className="text-center text-text-secondary font-medium px-2 py-2">Config</th>
                      <th className="text-right text-text-secondary font-medium px-2 py-2">Multi</th>
                      <th className="text-right text-text-secondary font-medium px-2 py-2">Win</th>
                      <th className="text-right text-text-secondary font-medium px-2 py-2">Balance</th>
                      <th className="text-left text-text-secondary font-medium px-2 py-2">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentHistory.map(h => {
                      const netCents = h.winCents - h.betCents;
                      return (
                        <tr key={h.roundId} className="border-b border-border-subtle/30 hover:bg-surface transition-colors">
                          <td className="px-2 py-1.5 font-mono text-text-secondary text-[10px]">{h.roundId.slice(0, 8)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-text-primary">${(h.betCents / 100).toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-center font-mono text-text-secondary">{h.rows}_{h.riskLevel}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-text-primary">{h.multiplier}x</td>
                          <td className={`px-2 py-1.5 text-right font-mono ${netCents >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            ${(h.winCents / 100).toFixed(2)}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-text-primary">${(h.balanceCents / 100).toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-text-secondary" title={absoluteTime(h.timestamp)}>
                            {relativeTime(h.timestamp)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Reset balance modal */}
      {showReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Reset balance">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowReset(false)} />
          <div className="relative bg-surface-alt border border-border-subtle rounded-lg max-w-sm w-full mx-4 p-5 shadow-2xl">
            <h3 className="text-text-primary text-sm font-semibold mb-3">Reset Balance</h3>
            <label htmlFor="reset-balance-input" className="block text-text-secondary text-xs font-medium mb-1.5">
              New balance (cents)
            </label>
            <input
              id="reset-balance-input"
              type="number"
              value={resetAmount}
              onChange={e => setResetAmount(e.target.value)}
              className="w-full px-3 py-2 bg-surface border border-border-subtle rounded text-text-primary text-sm font-mono mb-4
                         focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowReset(false)}
                className="px-4 py-2 text-text-secondary hover:text-text-primary text-xs font-medium rounded
                           border border-border-subtle transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {showDelete && (
        <ConfirmModal
          title="Delete Session"
          message={`This will permanently delete session ${sessionId.slice(0, 8)}... and all its history. This cannot be undone.`}
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}
