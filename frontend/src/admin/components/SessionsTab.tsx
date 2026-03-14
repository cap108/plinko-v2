import { useState, useEffect, useCallback } from 'react';
import type { AdminSessionEntry } from '@plinko-v2/shared';
import * as adminApi from '../adminApi';
import { SessionDetail } from './SessionDetail';
import { ConfirmModal } from './ConfirmModal';
import { useToast } from './Toast';

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function absoluteTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function isActive(ts: number): boolean {
  return Date.now() - ts < 5 * 60 * 1000; // 5 minutes
}

export function SessionsTab() {
  const [sessions, setSessions] = useState<AdminSessionEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPurge, setShowPurge] = useState(false);
  const pageSize = 20;

  const { toasts, addToast, removeToast } = useToast();

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getSessions(page, pageSize);
      setSessions(data.sessions);
      setTotal(data.total);
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to load sessions', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, addToast]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (selectedId) {
    return (
      <SessionDetail
        sessionId={selectedId}
        onBack={() => { setSelectedId(null); fetchSessions(); }}
      />
    );
  }

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

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-text-primary text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
          Sessions
          <span className="text-text-secondary font-normal normal-case">({total})</span>
        </h2>
        <button
          onClick={() => setShowPurge(true)}
          className="px-3 py-1.5 border border-border-subtle hover:border-red-400/30 text-text-secondary hover:text-red-400
                     text-xs font-medium rounded transition-colors"
        >
          Purge Expired
        </button>
      </div>

      {loading ? (
        <SessionsSkeleton />
      ) : (
        <>
          <div className="bg-surface-alt border border-border-subtle rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border-subtle">
                  <th className="text-left text-text-secondary font-medium px-4 py-2.5">Session ID</th>
                  <th className="text-right text-text-secondary font-medium px-4 py-2.5">Balance</th>
                  <th className="text-right text-text-secondary font-medium px-4 py-2.5">Rounds</th>
                  <th className="text-left text-text-secondary font-medium px-4 py-2.5">Last Active</th>
                  <th className="text-left text-text-secondary font-medium px-4 py-2.5">Created</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => {
                  const active = isActive(s.lastActiveAt);
                  const balanceDiff = s.balanceCents - 100_000; // vs initial
                  return (
                    <tr
                      key={s.sessionId}
                      tabIndex={0}
                      role="button"
                      aria-label={`Session ${s.sessionId.slice(0, 8)}`}
                      onClick={() => setSelectedId(s.sessionId)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(s.sessionId); } }}
                      className="border-b border-border-subtle/50 hover:bg-surface cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2.5 font-mono">
                        <div className="flex items-center gap-2">
                          {active && <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Active" />}
                          <span className="text-text-primary" title={s.sessionId}>
                            {s.sessionId.slice(0, 8)}...
                          </span>
                        </div>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono ${balanceDiff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ${(s.balanceCents / 100).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-text-primary font-mono">{s.roundCount}</td>
                      <td className="px-4 py-2.5 text-text-secondary" title={absoluteTime(s.lastActiveAt)}>
                        {relativeTime(s.lastActiveAt)}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary" title={absoluteTime(s.createdAt)}>
                        {relativeTime(s.createdAt)}
                      </td>
                    </tr>
                  );
                })}
                {sessions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-text-secondary">No sessions found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3">
            <p className="text-text-secondary text-xs">
              Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total} sessions
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 border border-border-subtle rounded text-xs text-text-secondary hover:text-text-primary
                           disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>
              <span className="px-3 py-1.5 text-xs text-text-secondary font-mono">{page}/{totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 border border-border-subtle rounded text-xs text-text-secondary hover:text-text-primary
                           disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* Purge modal */}
      {showPurge && (
        <ConfirmModal
          title="Purge Expired Sessions"
          message="This will permanently delete all expired sessions (inactive for 7+ days) and their history."
          confirmLabel="Purge"
          variant="destructive"
          onConfirm={async () => {
            try {
              const result = await adminApi.purgeExpiredSessions();
              addToast(`Purged ${result.purged} sessions`, 'success');
              fetchSessions();
            } catch (e) {
              addToast(e instanceof Error ? e.message : 'Purge failed', 'error');
            }
            setShowPurge(false);
          }}
          onCancel={() => setShowPurge(false)}
        />
      )}
    </div>
  );
}

function SessionsSkeleton() {
  return (
    <div className="bg-surface-alt border border-border-subtle rounded-lg p-4 space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-8 bg-border-subtle rounded animate-pulse" />
      ))}
    </div>
  );
}
