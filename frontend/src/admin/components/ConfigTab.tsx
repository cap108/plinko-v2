import { useState, useEffect, useCallback } from 'react';
import type { AdminConfigResponse } from '@plinko-v2/shared';
import * as adminApi from '../adminApi';
import { ConfirmModal } from './ConfirmModal';
import { useToast } from './Toast';

const ROW_COUNTS = [8, 10, 12, 14, 16] as const;
const RISKS = ['low', 'medium', 'high'] as const;

function computeRTP(multipliers: number[], weights: number[]): number {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return 0;
  return weights.reduce((acc, w, i) => acc + (w / sum) * (multipliers[i] ?? 0), 0);
}

function formatWeightPct(raw: string): string {
  const n = parseFloat(raw);
  if (isNaN(n) || n === 0) return '0%';
  const pct = n * 100;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  if (pct >= 0.1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(3)}%`;
}

function rtpColor(rtp: number): { bg: string; text: string; label: string } {
  const pct = rtp * 100;
  if (pct >= 98.5 && pct <= 99.5) return { bg: 'bg-green-500/15', text: 'text-green-400', label: 'OK' };
  if (pct >= 97.5 && pct <= 100) return { bg: 'bg-yellow-500/15', text: 'text-yellow-400', label: 'Warn' };
  return { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Out' };
}

interface ScalarFormState {
  minBetCents: string;
  maxBetCents: string;
  maxBetCount: string;
  initialBalanceCents: string;
  maintenanceMode: boolean;
}

export function ConfigTab() {
  const [config, setConfig] = useState<AdminConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scalarForm, setScalarForm] = useState<ScalarFormState>({
    minBetCents: '', maxBetCents: '', maxBetCount: '', initialBalanceCents: '', maintenanceMode: false,
  });
  const [scalarError, setScalarError] = useState('');

  // Paytable editor state
  const [selectedPaytable, setSelectedPaytable] = useState<string | null>(null);
  const [ptMultipliers, setPtMultipliers] = useState<string[]>([]);
  const [ptWeights, setPtWeights] = useState<string[]>([]);
  const [ptDirty, setPtDirty] = useState(false);
  const [ptSaving, setPtSaving] = useState(false);
  const [ptError, setPtError] = useState('');
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const [confirmMaintenance, setConfirmMaintenance] = useState(false);

  const { toasts, addToast, removeToast } = useToast();

  const fetchConfig = useCallback(async () => {
    try {
      const data = await adminApi.getConfig();
      setConfig(data);
      setScalarForm({
        minBetCents: String(data.effective.minBetCents),
        maxBetCents: String(data.effective.maxBetCents),
        maxBetCount: String(data.effective.maxBetCount),
        initialBalanceCents: String(data.effective.initialBalanceCents),
        maintenanceMode: data.effective.maintenanceMode,
      });
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to load config', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleScalarSave = async () => {
    if (!config) return;
    setScalarError('');
    setSaving(true);
    try {
      const updates: Record<string, number | boolean | null> = {};
      const fields = ['minBetCents', 'maxBetCents', 'maxBetCount', 'initialBalanceCents'] as const;
      for (const key of fields) {
        const val = parseInt(scalarForm[key], 10);
        if (isNaN(val)) continue;
        if (val !== config.effective[key]) updates[key] = val;
      }
      if (scalarForm.maintenanceMode !== config.effective.maintenanceMode) {
        updates.maintenanceMode = scalarForm.maintenanceMode;
      }
      if (Object.keys(updates).length === 0) {
        setScalarError('No changes to save');
        return;
      }
      await adminApi.updateConfig(updates);
      await fetchConfig();
      addToast('Config saved', 'success');
      announce('Configuration updated successfully');
    } catch (e) {
      setScalarError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleScalarReset = async (key: string) => {
    setSaving(true);
    try {
      await adminApi.updateConfig({ [key]: null });
      await fetchConfig();
      addToast(`${key} reset to default`, 'success');
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Reset failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const selectPaytable = (key: string) => {
    if (ptDirty && selectedPaytable && selectedPaytable !== key) {
      setConfirmDiscard(key);
      return;
    }
    openPaytableEditor(key);
  };

  const openPaytableEditor = (key: string) => {
    if (!config) return;
    setSelectedPaytable(key);
    setPtError('');
    setPtDirty(false);

    // Load current effective values — check overrides first, then fall back to paytables from API
    const overrides = config.overrides.paytableOverrides as Record<string, { multipliers: number[]; weights: number[] }> | undefined;
    const override = overrides?.[key];
    // The admin config API returns `paytables` with the effective (base or overridden) multipliers/probabilities
    const paytables = (config as unknown as Record<string, unknown>).paytables as Record<string, { multipliers: number[]; probabilities: number[] }> | undefined;
    const basePaytable = paytables?.[key];

    if (override) {
      setPtMultipliers(override.multipliers.map(String));
      setPtWeights(override.weights.map(String));
    } else if (basePaytable) {
      setPtMultipliers(basePaytable.multipliers.map(String));
      setPtWeights(basePaytable.probabilities.map(String));
    } else {
      const rows = parseInt(key.split('_')[0], 10);
      const slotCount = rows + 1;
      setPtMultipliers(new Array(slotCount).fill('0'));
      setPtWeights(new Array(slotCount).fill('0'));
    }
  };

  const handlePtSave = async () => {
    if (!selectedPaytable) return;
    setPtError('');
    const multipliers = ptMultipliers.map(Number);
    const weights = ptWeights.map(Number);

    if (multipliers.some(isNaN) || weights.some(isNaN)) {
      setPtError('All values must be valid numbers');
      return;
    }
    if (weights.every(w => w === 0)) {
      setPtError('At least one weight must be non-zero');
      return;
    }

    const rtp = computeRTP(multipliers, weights);
    if (rtp < 0.90 || rtp > 0.99) {
      setPtError(`RTP ${(rtp * 100).toFixed(2)}% is outside valid range [90%, 99%]`);
      return;
    }

    setPtSaving(true);
    try {
      // Merge with existing overrides
      const existing = (config?.overrides.paytableOverrides as Record<string, { multipliers: number[]; weights: number[] }>) ?? {};
      await adminApi.updateConfig({
        paytableOverrides: { ...existing, [selectedPaytable]: { multipliers, weights } },
      });
      await fetchConfig();
      setPtDirty(false);
      addToast(`Paytable ${selectedPaytable} saved`, 'success');
      announce(`Paytable ${selectedPaytable} updated`);
    } catch (e) {
      setPtError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setPtSaving(false);
    }
  };

  const handlePtReset = async () => {
    if (!selectedPaytable || !config) return;
    setPtSaving(true);
    try {
      const existing = { ...(config.overrides.paytableOverrides as Record<string, { multipliers: number[]; weights: number[] }> ?? {}) };
      delete existing[selectedPaytable];
      await adminApi.updateConfig({
        paytableOverrides: Object.keys(existing).length > 0 ? existing : null,
      });
      await fetchConfig();
      setSelectedPaytable(null);
      setPtDirty(false);
      addToast(`Paytable ${selectedPaytable} reset to default`, 'success');
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Reset failed', 'error');
    } finally {
      setPtSaving(false);
    }
  };

  if (loading) return <ConfigSkeleton />;
  if (!config) return <p className="text-red-400">Failed to load config</p>;

  const hasOverride = (key: string) => {
    const ov = config.overrides as Record<string, unknown>;
    return ov[key] !== undefined && ov[key] !== null;
  };

  // Live RTP for editor
  const editorRtp = selectedPaytable
    ? computeRTP(ptMultipliers.map(Number), ptWeights.map(Number))
    : 0;
  const editorRtpStyle = rtpColor(editorRtp);

  return (
    <div>
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm" aria-live="polite">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`px-4 py-2.5 rounded border text-sm font-medium shadow-lg animate-[slideIn_0.2s_ease-out]
              ${t.type === 'error' ? 'bg-red-500/15 border-red-500/30 text-red-400' : 'bg-green-500/15 border-green-500/30 text-green-400'}`}
          >
            <div className="flex items-center justify-between gap-3">
              <span>{t.message}</span>
              <button onClick={() => removeToast(t.id)} className="text-text-secondary hover:text-text-primary text-xs">&times;</button>
            </div>
          </div>
        ))}
      </div>

      {/* Section A: Scalar Config */}
      <section className="mb-8">
        <h2 className="text-text-primary text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
          Game Configuration
        </h2>
        <div className="bg-surface-alt border border-border-subtle rounded-lg p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              { key: 'minBetCents', label: 'Min Bet (cents)' },
              { key: 'maxBetCents', label: 'Max Bet (cents)' },
              { key: 'maxBetCount', label: 'Max Ball Count' },
              { key: 'initialBalanceCents', label: 'Initial Balance (cents)' },
            ] as const).map(({ key, label }) => (
              <div key={key}>
                <label htmlFor={`cfg-${key}`} className="block text-text-secondary text-xs font-medium mb-1">
                  {label}
                  {hasOverride(key) && (
                    <span className="ml-2 px-1.5 py-0.5 bg-amber-500/15 text-amber-400 text-[10px] rounded font-bold uppercase">
                      Override
                    </span>
                  )}
                </label>
                <div className="flex gap-2">
                  <input
                    id={`cfg-${key}`}
                    type="number"
                    value={scalarForm[key]}
                    onChange={e => setScalarForm(f => ({ ...f, [key]: e.target.value }))}
                    className="flex-1 px-3 py-2 bg-surface border border-border-subtle rounded text-text-primary text-sm font-mono
                               focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 transition-colors"
                  />
                  {hasOverride(key) && (
                    <button
                      onClick={() => handleScalarReset(key)}
                      className="px-2 py-1 text-text-secondary hover:text-amber-400 text-xs border border-border-subtle rounded hover:border-amber-500/30 transition-colors"
                      title="Reset to default"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <p className="text-text-secondary/60 text-[10px] mt-0.5 font-mono">
                  Default: {config.defaults[key]}
                </p>
              </div>
            ))}
          </div>

          {/* Maintenance toggle */}
          <div className="mt-4 pt-4 border-t border-border-subtle">
            <div className="flex items-center justify-between">
              <div>
                <label htmlFor="cfg-maintenance" className="text-text-secondary text-xs font-medium">
                  Maintenance Mode
                  {hasOverride('maintenanceMode') && (
                    <span className="ml-2 px-1.5 py-0.5 bg-amber-500/15 text-amber-400 text-[10px] rounded font-bold uppercase">
                      Override
                    </span>
                  )}
                </label>
                <p className="text-text-secondary/60 text-[10px] mt-0.5">Blocks new bets and session creation</p>
              </div>
              <button
                id="cfg-maintenance"
                role="switch"
                aria-checked={scalarForm.maintenanceMode}
                onClick={() => {
                  if (!scalarForm.maintenanceMode) {
                    setConfirmMaintenance(true);
                  } else {
                    setScalarForm(f => ({ ...f, maintenanceMode: false }));
                  }
                }}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  scalarForm.maintenanceMode ? 'bg-orange-600' : 'bg-border-subtle'
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  scalarForm.maintenanceMode ? 'translate-x-5' : ''
                }`} />
              </button>
            </div>
          </div>

          {scalarError && (
            <p className="text-red-400 text-xs mt-3" role="alert">{scalarError}</p>
          )}

          <div className="flex gap-3 mt-5">
            <button
              onClick={handleScalarSave}
              disabled={saving}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-600/40 text-white text-sm font-semibold
                         rounded transition-colors flex items-center gap-2"
            >
              {saving && <Spinner />}
              Save Config
            </button>
          </div>
        </div>
      </section>

      {/* Section B: Paytable Overrides */}
      <section>
        <h2 className="text-text-primary text-sm font-semibold uppercase tracking-wider mb-4 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
          Paytable Overrides
        </h2>
        <div className="bg-surface-alt border border-border-subtle rounded-lg p-5">
          {/* 5x3 Grid */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left text-text-secondary text-xs font-medium pb-2 pr-4">Rows</th>
                  {RISKS.map(r => (
                    <th key={r} className="text-center text-text-secondary text-xs font-medium pb-2 px-2 capitalize">{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROW_COUNTS.map(rows => (
                  <tr key={rows}>
                    <td className="text-text-primary font-mono text-xs py-1 pr-4">{rows}</td>
                    {RISKS.map(risk => {
                      const key = `${rows}_${risk}`;
                      const rtp = config.rtpReport[key] ?? 0;
                      const style = rtpColor(rtp);
                      const isSelected = selectedPaytable === key;
                      const overrides = config.overrides.paytableOverrides as Record<string, unknown> | undefined;
                      const isOverridden = !!overrides?.[key];
                      return (
                        <td key={key} className="px-1 py-1">
                          <button
                            onClick={() => selectPaytable(key)}
                            className={`w-full px-3 py-2 rounded text-xs font-mono transition-all border
                              ${isSelected ? 'border-amber-500 ring-1 ring-amber-500/30' : 'border-border-subtle hover:border-border-subtle/80'}
                              ${style.bg}`}
                          >
                            <span className={style.text}>{(rtp * 100).toFixed(1)}%</span>
                            <span className={`ml-1 text-[10px] ${style.text}`}>{style.label}</span>
                            {isOverridden && (
                              <span className="ml-1 text-amber-400 text-[10px]">*</span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paytable Detail Editor */}
          {selectedPaytable && (
            <div className="mt-4 pt-4 border-t border-border-subtle">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-text-primary text-sm font-semibold font-mono">{selectedPaytable}</h3>
                <div className={`px-3 py-1 rounded text-sm font-bold font-mono ${editorRtpStyle.bg} ${editorRtpStyle.text}`}>
                  RTP: {(editorRtp * 100).toFixed(2)}% ({editorRtpStyle.label})
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="text-left text-text-secondary font-medium pb-1 w-16">Slot</th>
                      <th className="text-left text-text-secondary font-medium pb-1">Multiplier</th>
                      <th className="text-left text-text-secondary font-medium pb-1">Weight (probability)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ptMultipliers.map((_, idx) => (
                      <tr key={idx}>
                        <td className="text-text-secondary font-mono py-0.5 pr-2">#{idx}</td>
                        <td className="py-0.5 pr-2">
                          <input
                            type="number"
                            step="any"
                            value={ptMultipliers[idx]}
                            onChange={e => {
                              const next = [...ptMultipliers];
                              next[idx] = e.target.value;
                              setPtMultipliers(next);
                              setPtDirty(true);
                            }}
                            aria-label={`Slot ${idx} multiplier`}
                            className="w-full px-2 py-1 bg-surface border border-border-subtle rounded text-text-primary font-mono text-xs
                                       focus:outline-none focus:border-amber-500/60 transition-colors"
                          />
                        </td>
                        <td className="py-0.5">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="any"
                              value={ptWeights[idx]}
                              onChange={e => {
                                const next = [...ptWeights];
                                next[idx] = e.target.value;
                                setPtWeights(next);
                                setPtDirty(true);
                              }}
                              aria-label={`Slot ${idx} weight`}
                              className="w-full px-2 py-1 bg-surface border border-border-subtle rounded text-text-primary font-mono text-xs
                                         focus:outline-none focus:border-amber-500/60 transition-colors"
                            />
                            <span className="text-text-secondary font-mono text-[10px] whitespace-nowrap w-14 text-right">
                              {formatWeightPct(ptWeights[idx])}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {ptError && (
                <p className="text-red-400 text-xs mt-2" role="alert">{ptError}</p>
              )}

              <div className="flex gap-3 mt-3">
                <button
                  onClick={handlePtSave}
                  disabled={ptSaving}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-600/40 text-white text-xs font-semibold
                             rounded transition-colors flex items-center gap-2"
                >
                  {ptSaving && <Spinner />}
                  Save Paytable
                </button>
                <button
                  onClick={handlePtReset}
                  disabled={ptSaving}
                  className="px-4 py-2 border border-border-subtle hover:border-text-secondary text-text-secondary hover:text-text-primary
                             text-xs font-medium rounded transition-colors"
                >
                  Reset to Default
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Discard changes modal */}
      {confirmDiscard && (
        <ConfirmModal
          title="Discard Changes?"
          message="You have unsaved paytable changes. Discard and switch?"
          confirmLabel="Discard"
          variant="warning"
          onConfirm={() => {
            openPaytableEditor(confirmDiscard);
            setConfirmDiscard(null);
          }}
          onCancel={() => setConfirmDiscard(null)}
        />
      )}

      {/* Maintenance mode confirm */}
      {confirmMaintenance && (
        <ConfirmModal
          title="Enable Maintenance Mode?"
          message="This will block all new bets and session creation. Existing bets in-flight will complete normally."
          confirmLabel="Enable"
          variant="warning"
          onConfirm={() => {
            setScalarForm(f => ({ ...f, maintenanceMode: true }));
            setConfirmMaintenance(false);
          }}
          onCancel={() => setConfirmMaintenance(false)}
        />
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function ConfigSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-surface-alt border border-border-subtle rounded-lg p-5">
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="h-3 w-24 bg-border-subtle rounded animate-pulse mb-2" />
              <div className="h-9 bg-border-subtle rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
      <div className="bg-surface-alt border border-border-subtle rounded-lg p-5">
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="h-10 bg-border-subtle rounded animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

function announce(msg: string) {
  const el = document.getElementById('admin-status');
  if (el) el.textContent = msg;
}
