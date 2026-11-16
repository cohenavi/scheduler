import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Layers,
  Play,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api';
import type {
  AnalyticsData,
  AssignmentType,
  AutoGenerateResult,
  Category,
  ConstraintRule,
  ConstraintViolation,
  Person,
  PublishStatus,
  ScheduleTemplate,
  Shift,
} from '../types';

const ModalShell: React.FC<{
  title: string;
  onClose: () => void;
  maxWidth?: string;
  children: React.ReactNode;
}> = ({ title, onClose, maxWidth = 'max-w-2xl', children }) => (
  <div
    data-modal-open="true"
    className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]"
    onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
  >
    <div
      className={`w-full ${maxWidth} max-h-[90vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="overflow-y-auto p-4">{children}</div>
    </div>
  </div>
);

// 1. Rules & Constraints Engine Modal
export const RulesEngineModal: React.FC<{
  assignmentTypes: AssignmentType[];
  categories: Category[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}> = ({ assignmentTypes, categories, onClose, onRefresh }) => {
  const [rules, setRules] = useState<ConstraintRule[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [ruleType, setRuleType] = useState('MUTUAL_EXCLUSION_AND_REST');
  const [enforcement, setEnforcement] = useState<'HARD_BLOCK' | 'SOFT_WARN'>('SOFT_WARN');
  const [restMode, setRestMode] = useState<'MIN_REST_HOURS' | 'SAME_DAY_EXCLUSION'>('MIN_REST_HOURS');
  const [minRestHours, setMinRestHours] = useState(12);
  const [fromAtId, setFromAtId] = useState(assignmentTypes[0]?.id ?? '');
  const [atIdA, setAtIdA] = useState(assignmentTypes[0]?.id ?? '');
  const [atIdB, setAtIdB] = useState(assignmentTypes[1]?.id ?? assignmentTypes[0]?.id ?? '');

  const loadRules = async () => {
    setLoading(true);
    try {
      const list = await api.getRules();
      setRules(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const config =
      ruleType === 'MUTUAL_EXCLUSION_AND_REST'
        ? restMode === 'MIN_REST_HOURS'
          ? { mode: 'MIN_REST_HOURS', minRestHours, fromAssignmentTypeId: fromAtId || null }
          : { mode: 'SAME_DAY_EXCLUSION', assignmentTypeIdA: atIdA, assignmentTypeIdB: atIdB }
        : {};

    await api.createRule({
      name: name.trim(),
      ruleType,
      enforcement,
      config,
      isActive: true,
    });
    setName('');
    await loadRules();
    await onRefresh();
  };

  return (
    <ModalShell title="Rules & Constraints Engine" onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Rules are evaluated automatically on every single-cell edit, drag-and-drop, batch hotkey,
          template stamp, and auto-schedule run. Toggle <strong>Hard Block</strong> to reject
          violating mutations at the API level, or <strong>Soft Warn</strong> to flag them on the grid.
        </p>

        {/* Rule List */}
        {loading ? (
          <p className="text-xs text-slate-400">Loading rules...</p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {rules.map((rule) => (
              <div key={rule.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={rule.isActive}
                    onChange={async (e) => {
                      await api.updateRule(rule.id, { isActive: e.target.checked });
                      await loadRules();
                      await onRefresh();
                    }}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                  />
                  <div>
                    <div className="font-semibold text-slate-900">{rule.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {rule.ruleType}
                      {rule.ruleType === 'MUTUAL_EXCLUSION_AND_REST' &&
                        rule.config &&
                        ` • ${String(rule.config.mode || '')}${
                          rule.config.minRestHours ? ` (${rule.config.minRestHours}h)` : ''
                        }`}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={rule.enforcement}
                    onChange={async (e) => {
                      await api.updateRule(rule.id, {
                        enforcement: e.target.value as 'HARD_BLOCK' | 'SOFT_WARN',
                      });
                      await loadRules();
                      await onRefresh();
                    }}
                    aria-label={`Enforcement for ${rule.name}`}
                    className={`h-7 rounded border px-2 text-[11px] font-semibold ${
                      rule.enforcement === 'HARD_BLOCK'
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}
                  >
                    <option value="SOFT_WARN">Soft Warn</option>
                    <option value="HARD_BLOCK">Hard Block</option>
                  </select>

                  <button
                    type="button"
                    onClick={async () => {
                      await api.deleteRule(rule.id);
                      await loadRules();
                      await onRefresh();
                    }}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Custom Rule */}
        <form onSubmit={handleCreate} className="space-y-2.5 rounded-lg bg-slate-50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <ShieldAlert className="h-3.5 w-3.5 text-blue-600" />
            <span>Add Custom Constraint Rule</span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Rule Name (e.g. No Clinic + Call)"
              className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
            />
            <select
              value={ruleType}
              onChange={(e) => setRuleType(e.target.value)}
              className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
            >
              <option value="MUTUAL_EXCLUSION_AND_REST">Turnaround Rest / Mutual Exclusion</option>
              <option value="QUALIFICATION">Qualification Confinement</option>
              <option value="DAY_OF_WEEK">Day-of-Week Validity</option>
              <option value="TIME_OVERLAP">Time-Overlap Prevention</option>
              <option value="WORKLOAD_CAP">Workload &amp; Hour Cap</option>
            </select>
            <select
              value={enforcement}
              onChange={(e) => setEnforcement(e.target.value as 'HARD_BLOCK' | 'SOFT_WARN')}
              className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
            >
              <option value="SOFT_WARN">Soft Warn</option>
              <option value="HARD_BLOCK">Hard Block</option>
            </select>
          </div>

          {ruleType === 'MUTUAL_EXCLUSION_AND_REST' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <select
                value={restMode}
                onChange={(e) =>
                  setRestMode(e.target.value as 'MIN_REST_HOURS' | 'SAME_DAY_EXCLUSION')
                }
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
              >
                <option value="MIN_REST_HOURS">Minimum Rest Hours After Assignment</option>
                <option value="SAME_DAY_EXCLUSION">Same-Day Mutual Exclusion Pair</option>
              </select>

              {restMode === 'MIN_REST_HOURS' ? (
                <>
                  <select
                    value={fromAtId}
                    onChange={(e) => setFromAtId(e.target.value)}
                    className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
                  >
                    <option value="">Any Assignment</option>
                    {assignmentTypes.map((a) => (
                      <option key={a.id} value={a.id}>
                        After {a.shortCode} ({a.name})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={48}
                    value={minRestHours}
                    onChange={(e) => setMinRestHours(Number(e.target.value))}
                    className="h-7 w-20 rounded border border-slate-200 bg-white px-2 text-xs"
                  />
                  <span className="text-slate-500">hours rest</span>
                </>
              ) : (
                <>
                  <select
                    value={atIdA}
                    onChange={(e) => setAtIdA(e.target.value)}
                    className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
                  >
                    {assignmentTypes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.shortCode}
                      </option>
                    ))}
                  </select>
                  <span className="text-slate-500">cannot share day with</span>
                  <select
                    value={atIdB}
                    onChange={(e) => setAtIdB(e.target.value)}
                    className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
                  >
                    {assignmentTypes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.shortCode}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex h-7 items-center gap-1 rounded bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Rule</span>
            </button>
          </div>
        </form>
        {void categories}
      </div>
    </ModalShell>
  );
};

// 2. Rotation Templates Modal
export const RotationTemplatesModal: React.FC<{
  defaultStartDate: string;
  onClose: () => void;
  onApplied: (res: {
    created: Shift[];
    removed: Shift[];
    skippedLocked: number;
    skippedConflicts: number;
    violations: ConstraintViolation[];
  }) => Promise<void>;
}> = ({ defaultStartDate, onClose, onApplied }) => {
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Save current block form
  const [tplName, setTplName] = useState('');
  const [cycleWeeks, setCycleWeeks] = useState(2);
  const [sourceStartDate, setSourceStartDate] = useState(defaultStartDate);

  // Apply form
  const [selectedTplId, setSelectedTplId] = useState('');
  const [repeatAcrossMonth, setRepeatAcrossMonth] = useState(false);
  const [targetStartDate, setTargetStartDate] = useState(defaultStartDate);
  const [targetMonth, setTargetMonth] = useState(defaultStartDate.slice(0, 7));
  const [applyMode, setApplyMode] = useState<'MERGE' | 'REPLACE_UNLOCKED'>('MERGE');
  const [conflictMode, setConflictMode] = useState<'SKIP_CONFLICTS' | 'ATOMIC_ROLLBACK'>(
    'SKIP_CONFLICTS'
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.getTemplates();
      setTemplates(list);
      if (list.length > 0 && !selectedTplId) {
        setSelectedTplId(list[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSaveBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplName.trim()) return;
    setBusy(true);
    setError('');
    try {
      const created = await api.createTemplate({
        name: tplName.trim(),
        cycleWeeks,
        startDate: sourceStartDate,
      });
      setTplName('');
      setSelectedTplId(created.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTplId) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.applyTemplate(selectedTplId, {
        targetStartDate: repeatAcrossMonth ? undefined : targetStartDate,
        repeatAcrossMonth,
        targetMonth: repeatAcrossMonth ? targetMonth : undefined,
        mode: applyMode,
        conflictMode,
      });
      await onApplied(res);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply template');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Rotation Templates" onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-5">
        {/* Save Block as Template */}
        <form onSubmit={handleSaveBlock} className="space-y-2.5 rounded-lg bg-slate-50 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <Layers className="h-3.5 w-3.5 text-blue-600" />
            <span>Save Current Draft Block as Template</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input
              required
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="Template Name..."
              className="h-7 rounded border border-slate-200 bg-white px-2 text-xs sm:col-span-2"
            />
            <select
              value={cycleWeeks}
              onChange={(e) => setCycleWeeks(Number(e.target.value))}
              className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
            >
              <option value={1}>1 Week (7 days)</option>
              <option value={2}>2 Weeks (14 days)</option>
              <option value={4}>4 Weeks (28 days)</option>
            </select>
            <input
              type="date"
              value={sourceStartDate}
              onChange={(e) => setSourceStartDate(e.target.value)}
              className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-7 items-center gap-1 rounded bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Save as Template</span>
            </button>
          </div>
        </form>

        {/* Saved Templates List */}
        <div>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Saved Templates ({templates.length})
          </h3>
          {loading ? (
            <p className="text-xs text-slate-400">Loading templates...</p>
          ) : (
            <div className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {templates.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTplId(t.id)}
                  className={`flex cursor-pointer items-center justify-between px-3 py-2 text-xs ${
                    selectedTplId === t.id ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-slate-900">{t.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {t.cycleWeeks} week(s) • {t.entries.length} shift entries
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await api.deleteTemplate(t.id);
                      await load();
                    }}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Apply / Stamp Template */}
        {templates.length > 0 && (
          <form onSubmit={handleApply} className="space-y-3 border-t border-slate-200 pt-4">
            <div className="text-xs font-semibold text-slate-800">
              Stamp Template onto Future Date / Month
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                  Template
                </label>
                <select
                  value={selectedTplId}
                  onChange={(e) => setSelectedTplId(e.target.value)}
                  className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.cycleWeeks}w)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600">
                  Existing Shifts Handling
                </label>
                <select
                  value={applyMode}
                  onChange={(e) =>
                    setApplyMode(e.target.value as 'MERGE' | 'REPLACE_UNLOCKED')
                  }
                  className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs"
                >
                  <option value="MERGE">Merge into Open Slots</option>
                  <option value="REPLACE_UNLOCKED">Replace Unlocked Shifts (Preserve Locked)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={repeatAcrossMonth}
                  onChange={(e) => setRepeatAcrossMonth(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                />
                <span>Repeat Cycle Across Full Month</span>
              </label>

              {repeatAcrossMonth ? (
                <input
                  type="month"
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                  className="h-7 rounded border border-slate-200 px-2 text-xs"
                />
              ) : (
                <input
                  type="date"
                  value={targetStartDate}
                  onChange={(e) => setTargetStartDate(e.target.value)}
                  className="h-7 rounded border border-slate-200 px-2 text-xs"
                />
              )}

              <select
                value={conflictMode}
                onChange={(e) =>
                  setConflictMode(e.target.value as 'SKIP_CONFLICTS' | 'ATOMIC_ROLLBACK')
                }
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
              >
                <option value="SKIP_CONFLICTS">Skip Hard Conflicts &amp; Apply Valid</option>
                <option value="ATOMIC_ROLLBACK">Atomic Rollback on Hard Block</option>
              </select>
            </div>

            {error && <p className="text-xs font-medium text-red-600">{error}</p>}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy || !selectedTplId}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" />
                <span>{busy ? 'Stamping...' : 'Stamp Template to Draft'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </ModalShell>
  );
};

// 3. Auto-Scheduler Modal
export const AutoSchedulerModal: React.FC<{
  defaultStartDate: string;
  defaultEndDate: string;
  categories: Category[];
  assignmentTypes: AssignmentType[];
  onClose: () => void;
  onApplied: (res: AutoGenerateResult) => Promise<void>;
}> = ({
  defaultStartDate,
  defaultEndDate,
  categories,
  assignmentTypes,
  onClose,
  onApplied,
}) => {
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [mode, setMode] = useState<'FILL_GAPS' | 'REBALANCE_UNLOCKED'>('FILL_GAPS');
  const [selectedCatId, setSelectedCatId] = useState('');
  const [selectedAtId, setSelectedAtId] = useState('');
  const [preview, setPreview] = useState<AutoGenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runPreview = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.autoGenerate({
        startDate,
        endDate,
        categoryIds: selectedCatId ? [selectedCatId] : undefined,
        assignmentTypeIds: selectedAtId ? [selectedAtId] : undefined,
        mode,
        apply: false,
      });
      setPreview(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  const applyToDraft = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.autoGenerate({
        startDate,
        endDate,
        categoryIds: selectedCatId ? [selectedCatId] : undefined,
        assignmentTypeIds: selectedAtId ? [selectedAtId] : undefined,
        mode,
        apply: true,
      });
      await onApplied(res);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell title="Auto-Fill Schedule Solver" onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2.5 rounded-lg bg-slate-50 p-3 sm:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-7 w-full rounded border border-slate-200 bg-white px-2 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-7 w-full rounded border border-slate-200 bg-white px-2 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">Solver Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'FILL_GAPS' | 'REBALANCE_UNLOCKED')}
              className="h-7 w-full rounded border border-slate-200 bg-white px-2 text-xs"
            >
              <option value="FILL_GAPS">Fill Open Coverage Gaps Only</option>
              <option value="REBALANCE_UNLOCKED">Rebalance Unlocked Shifts</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">Category Scope</label>
            <select
              value={selectedCatId}
              onChange={(e) => {
                setSelectedCatId(e.target.value);
                setSelectedAtId('');
              }}
              className="h-7 w-full rounded border border-slate-200 bg-white px-2 text-xs"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
            <span>
              Prioritizes scarce/overnight slots first and balances cumulative Category Hours.
            </span>
          </div>
          <button
            type="button"
            onClick={runPreview}
            disabled={loading}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? 'Solving...' : 'Generate Preview'}
          </button>
        </div>

        {error && <p className="text-xs font-medium text-red-600">{error}</p>}

        {preview && (
          <div className="space-y-4 border-t border-slate-200 pt-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
                <div className="text-lg font-bold text-emerald-800 tabular-nums">
                  {preview.slotsFilled}
                </div>
                <div className="text-[11px] font-medium text-emerald-700">Slots Filled</div>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5">
                <div className="text-lg font-bold text-blue-800 tabular-nums">
                  {preview.lockedPreserved}
                </div>
                <div className="text-[11px] font-medium text-blue-700">Locked Preserved</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <div className="text-lg font-bold text-amber-800 tabular-nums">
                  {preview.unfilledGaps.length}
                </div>
                <div className="text-[11px] font-medium text-amber-700">Unfilled Gaps</div>
              </div>
            </div>

            {/* Category Hours Variance Comparison */}
            <div>
              <h4 className="mb-1.5 text-xs font-semibold text-slate-700">
                Before vs. After Category Hours Variance
              </h4>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[11px] text-slate-600">
                    <tr>
                      <th className="px-3 py-1.5">Category</th>
                      <th className="px-3 py-1.5">Before (Avg / StdDev)</th>
                      <th className="px-3 py-1.5">After (Avg / StdDev)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
                    {preview.categoryVariance.after.map((afterRow, i) => {
                      const beforeRow = preview.categoryVariance.before[i];
                      return (
                        <tr key={afterRow.categoryId}>
                          <td className="px-3 py-1.5 font-medium text-slate-900">
                            {afterRow.categoryName}
                          </td>
                          <td className="px-3 py-1.5 text-slate-500">
                            {beforeRow?.avgHours ?? 0}h (σ {beforeRow?.stdDev ?? 0})
                          </td>
                          <td className="px-3 py-1.5 font-semibold text-slate-900">
                            {afterRow.avgHours}h (σ {afterRow.stdDev})
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {preview.unfilledGaps.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-xs font-semibold text-amber-800">
                  Unfilled Gaps ({preview.unfilledGaps.length})
                </h4>
                <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50/50 p-2 text-xs">
                  {preview.unfilledGaps.map((g, idx) => (
                    <div key={idx} className="text-amber-900">
                      <strong>{g.date}</strong> [{g.shortCode}]: {g.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyToDraft}
                disabled={loading || preview.slotsFilled === 0}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Apply to Draft</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};

// 4. Admin Stats & Analytics Modal
export const StatsModal: React.FC<{
  startDate: string;
  endDate: string;
  categories: Category[];
  assignmentTypes: AssignmentType[];
  people: Person[];
  shifts: Shift[];
  initialViewMode: PublishStatus;
  onClose: () => void;
}> = ({
  startDate,
  endDate,
  categories,
  assignmentTypes,
  people,
  shifts,
  initialViewMode,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<PublishStatus>(initialViewMode);
  const [stats, setStats] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .getAnalytics(startDate, endDate, viewMode)
      .then(setStats)
      .finally(() => setLoading(false));
  }, [startDate, endDate, viewMode]);

  const exportCsv = () => {
    const personMap = new Map(people.map((p) => [p.id, p]));
    const atMap = new Map(assignmentTypes.map((a) => [a.id, a]));
    const catMap = new Map(categories.map((c) => [c.id, c]));

    const rows = [
      ['Date', 'Person', 'Role', 'Assignment', 'ShortCode', 'Category', 'StartTime', 'EndTime', 'Locked', 'Note'],
    ];

    for (const s of [...shifts].sort((a, b) => a.date.localeCompare(b.date))) {
      const p = personMap.get(s.personId);
      const at = atMap.get(s.assignmentTypeId);
      const cat = at ? catMap.get(at.categoryId) : undefined;
      rows.push([
        s.date,
        p?.name ?? '',
        p?.role ?? '',
        at?.name ?? '',
        at?.shortCode ?? '',
        cat?.name ?? '',
        s.customStartTime || at?.startTime || '',
        s.customEndTime || at?.endTime || '',
        s.isLocked ? 'Yes' : 'No',
        (s.note || '').replace(/"/g, '""'),
      ]);
    }

    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule-stats-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ModalShell title="Admin Stats & Analytics" onClose={onClose} maxWidth="max-w-4xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('DRAFT')}
              className={`rounded px-2.5 py-1 font-medium ${
                viewMode === 'DRAFT' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Working Draft
            </button>
            <button
              type="button"
              onClick={() => setViewMode('PUBLISHED')}
              className={`rounded px-2.5 py-1 font-medium ${
                viewMode === 'PUBLISHED' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Live Published
            </button>
          </div>

          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
        </div>

        {loading || !stats ? (
          <p className="text-xs text-slate-400">Computing analytics...</p>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[
                ['Total Shifts', stats.kpis.totalShifts],
                ['Total Hours', `${stats.kpis.totalHours}h`],
                ['Coverage Rate', `${stats.kpis.coverageRate}%`],
                ['Conflicts', stats.kpis.conflictCount],
              ].map(([label, val]) => (
                <div key={String(label)} className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                  <div className="text-[11px] font-medium text-slate-500">{label}</div>
                  <div className="mt-0.5 text-base font-bold text-slate-900 tabular-nums">{val}</div>
                </div>
              ))}
            </div>

            {/* Category Breakdown */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {stats.categoryTotals.map((c) => (
                <div key={c.categoryId} className="rounded-lg border border-slate-200 p-2.5 text-xs">
                  <div className="flex items-center justify-between font-semibold text-slate-800">
                    <span>{c.name}</span>
                    <span className="tabular-nums">{c.hours}h</span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 tabular-nums">
                    {c.shifts} shifts scheduled
                  </div>
                </div>
              ))}
            </div>

            {/* Per-Person Table */}
            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-[11px] text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Staff Member</th>
                    <th className="px-3 py-2">Shifts</th>
                    <th className="px-3 py-2">Hours</th>
                    <th className="px-3 py-2">Variance vs Avg</th>
                    {stats.categoryTotals.map((c) => (
                      <th key={c.categoryId} className="px-3 py-2">
                        {c.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {stats.personStats.map((p) => (
                    <tr key={p.personId} className="hover:bg-slate-50/70">
                      <td className="px-3 py-1.5">
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        <div className="text-[10px] text-slate-400">{p.role}</div>
                      </td>
                      <td className="px-3 py-1.5 font-medium">{p.totalShifts}</td>
                      <td className="px-3 py-1.5 font-semibold">{p.totalHours}h</td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            p.varianceFromAvgHours > 4
                              ? 'bg-amber-100 text-amber-800'
                              : p.varianceFromAvgHours < -4
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {p.varianceFromAvgHours >= 0 ? `+${p.varianceFromAvgHours}h` : `${p.varianceFromAvgHours}h`}
                        </span>
                      </td>
                      {stats.categoryTotals.map((c) => {
                        const cell = p.byCategory[c.categoryId] ?? { shifts: 0, hours: 0 };
                        return (
                          <td key={c.categoryId} className="px-3 py-1.5 text-slate-600">
                            {cell.hours}h ({cell.shifts})
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
};

// 5. Public "Sync My Calendar" Modal (.ics Subscription)
export const SyncCalendarModal: React.FC<{
  people: Person[];
  onClose: () => void;
}> = ({ people, onClose }) => {
  const [selectedId, setSelectedId] = useState(people[0]?.id ?? '');
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!selectedId) return;
    api
      .getCalendarLink(selectedId)
      .then((res) => setToken(res.calendarToken))
      .catch(() => setToken(''));
  }, [selectedId]);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const httpsUrl = token ? `${origin}/api/calendar/${token}.ics` : '';
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, 'webcal://');

  return (
    <ModalShell title="Sync My Calendar (.ics Feed)" onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-3 text-xs">
        <p className="text-slate-500">
          Subscribe to your personal published shift feed in Apple Calendar, Google Calendar, or
          Outlook. Only <strong>Published</strong> shifts are included.
        </p>

        <div>
          <label className="mb-1 block font-medium text-slate-700">Select Your Name</label>
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setCopied(false);
            }}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2.5 text-xs"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.role}
              </option>
            ))}
          </select>
        </div>

        {httpsUrl && (
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            <div className="flex items-center gap-1.5 font-medium text-slate-700">
              <Calendar className="h-3.5 w-3.5 text-blue-600" />
              <span>Personal Subscription URL</span>
            </div>
            <input
              readOnly
              value={httpsUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 font-mono text-[11px] text-slate-700"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(httpsUrl);
                  setCopied(true);
                }}
                className="inline-flex items-center gap-1 rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800"
              >
                <Copy className="h-3 w-3" />
                <span>{copied ? 'Copied!' : 'Copy URL'}</span>
              </button>
              <a
                href={webcalUrl}
                className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <ExternalLink className="h-3 w-3" />
                <span>Open in Calendar App</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
