import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Check,
  Database,
  Download,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../api';
import {
  eventToCombo,
  formatCombo,
  SHORTCUT_DEFINITIONS,
  type ShortcutActionId,
  type ShortcutMap,
} from '../shortcuts';
import type { AssignmentType, Category, Person } from '../types';
import { getContrastTextColor } from '../utils';

interface ModalShellProps {
  title: string;
  onClose: () => void;
  maxWidth?: string;
  children: React.ReactNode;
}

const ModalShell: React.FC<ModalShellProps> = ({
  title,
  onClose,
  maxWidth = 'max-w-lg',
  children,
}) => (
  <div
    data-modal-open="true"
    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]"
    onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
  >
    <div className={`w-full ${maxWidth} max-h-[90vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl`}>
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

// 1. Admin Login Modal
export const LoginModal: React.FC<{
  onClose: () => void;
  onSuccess: () => void;
}> = ({ onClose, onSuccess }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell title="Admin Login" onClose={onClose} maxWidth="max-w-sm">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-slate-500">
          Enter the administrator password to edit drafts, manage staff, and publish schedules.
        </p>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700">Password</label>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter admin password"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !password}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};

// 2. Keyboard Shortcuts Legend & Customization Modal
export const ShortcutsModal: React.FC<{
  onClose: () => void;
  assignmentTypes: AssignmentType[];
  shortcuts: ShortcutMap;
  onChangeShortcuts: (next: ShortcutMap) => void;
  onResetShortcuts: () => void;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}> = ({
  onClose,
  assignmentTypes,
  shortcuts,
  onChangeShortcuts,
  onResetShortcuts,
  isAdmin,
  onRefresh,
}) => {
  const [capturingAction, setCapturingAction] = useState<ShortcutActionId | null>(null);
  const [capturingAssignmentId, setCapturingAssignmentId] = useState<string | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!capturingAction && !capturingAssignmentId) return;

    const handleCapture = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setCapturingAction(null);
        setCapturingAssignmentId(null);
        setConflictMsg(null);
        return;
      }

      if (capturingAction) {
        const combo = eventToCombo(e);
        if (!combo) return; // modifier-only press

        const existingEntry = SHORTCUT_DEFINITIONS.find(
          (def) => def.id !== capturingAction && shortcuts[def.id]?.toLowerCase() === combo.toLowerCase()
        );
        if (existingEntry) {
          setConflictMsg(
            `"${formatCombo(combo)}" is already used for "${existingEntry.description}".`
          );
          return;
        }
        setConflictMsg(null);
        onChangeShortcuts({ ...shortcuts, [capturingAction]: combo });
        setCapturingAction(null);
        return;
      }

      if (capturingAssignmentId) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const rawKey = e.key === 'Backspace' || e.key === 'Delete' ? '' : e.key.slice(0, 1);
        if (rawKey && rawKey.trim() === '') return;

        if (rawKey) {
          const dup = assignmentTypes.find(
            (at) => at.id !== capturingAssignmentId && at.shortcutKey?.toLowerCase() === rawKey.toLowerCase()
          );
          if (dup) {
            setConflictMsg(`Key "${rawKey}" is already assigned to ${dup.shortCode}.`);
            return;
          }
        }
        try {
          setConflictMsg(null);
          await api.updateAssignmentType(capturingAssignmentId, {
            shortcutKey: rawKey || null,
          });
          setCapturingAssignmentId(null);
          await onRefresh();
        } catch (err) {
          setConflictMsg(err instanceof Error ? err.message : 'Failed to update assignment hotkey');
        }
      }
    };

    window.addEventListener('keydown', handleCapture, true);
    return () => window.removeEventListener('keydown', handleCapture, true);
  }, [
    capturingAction,
    capturingAssignmentId,
    shortcuts,
    assignmentTypes,
    onChangeShortcuts,
    onRefresh,
  ]);

  const staticGestures = [
    ['Click Day Box', 'Open cell editor to assign, lock, or add note'],
    ['Click & Drag', 'Marquee-select a range of cells'],
    ['Shift + Click / Arrows', 'Extend rectangular selection'],
    ['Escape', 'Close popover or clear selection'],
  ];

  return (
    <ModalShell title="Keyboard Shortcuts & Customization" onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Click any shortcut badge below and press a new key to customize it. Press{' '}
            <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
              {formatCombo(shortcuts.help)}
            </kbd>{' '}
            or{' '}
            <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
              ?
            </kbd>{' '}
            anytime to open this popup.
          </span>
          <button
            type="button"
            onClick={() => {
              setConflictMsg(null);
              setCapturingAction(null);
              setCapturingAssignmentId(null);
              onResetShortcuts();
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset Defaults</span>
          </button>
        </div>

        {conflictMsg && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
            {conflictMsg}
          </div>
        )}

        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Customizable Shortcuts
          </h4>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {SHORTCUT_DEFINITIONS.map((def) => {
              const isCapturing = capturingAction === def.id;
              return (
                <div key={def.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <span className="text-slate-700">
                    {def.description}
                    {def.adminOnly && (
                      <span className="ml-1.5 text-[10px] text-slate-400">(Admin Draft)</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setConflictMsg(null);
                      setCapturingAssignmentId(null);
                      setCapturingAction(isCapturing ? null : def.id);
                    }}
                    title="Click to customize this shortcut"
                    className={`shrink-0 rounded border px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors ${
                      isCapturing
                        ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                        : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-blue-300 hover:bg-blue-50/50'
                    }`}
                  >
                    {isCapturing ? 'Press key...' : formatCombo(shortcuts[def.id])}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Mouse &amp; Navigation
          </h4>
          <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {staticGestures.map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                <span className="text-slate-600">{desc}</span>
                <kbd className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-800">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        {assignmentTypes.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Assignment Quick-Assign Hotkeys
              </h4>
              {isAdmin && (
                <span className="text-[10px] text-slate-400">
                  Click a pill to bind key (Del to clear)
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {assignmentTypes.map((a) => {
                const isCapturing = capturingAssignmentId === a.id;
                const fg = getContrastTextColor(a.colorHex);
                return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => {
                      if (!isAdmin) return;
                      setConflictMsg(null);
                      setCapturingAction(null);
                      setCapturingAssignmentId(isCapturing ? null : a.id);
                    }}
                    style={{ backgroundColor: a.colorHex, color: fg }}
                    className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold transition-all ${
                      isAdmin ? 'cursor-pointer hover:opacity-90' : 'cursor-default opacity-90'
                    } ${isCapturing ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                  >
                    <kbd className="rounded bg-black/15 px-1 font-mono text-[10px]">
                      {isCapturing ? 'Key...' : a.shortcutKey ? `[${a.shortcutKey}]` : '[None]'}
                    </kbd>
                    <span>
                      {a.shortCode} — {a.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};

// 3. Person Profile Drawer
export const PersonDrawer: React.FC<{
  person: Person;
  assignmentTypes: AssignmentType[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}> = ({ person, assignmentTypes, onClose, onRefresh }) => {
  const [name, setName] = useState(person.name);
  const [role, setRole] = useState(person.role);
  const [maxShifts, setMaxShifts] = useState(person.maxShiftsPerWeek?.toString() ?? '');
  const [maxHours, setMaxHours] = useState(person.maxHoursPerWeek?.toString() ?? '');
  const [allowedIds, setAllowedIds] = useState<string[]>(person.allowedAssignmentIds ?? []);
  const [calendarToken, setCalendarToken] = useState(person.calendarToken ?? '');
  const [rotatingToken, setRotatingToken] = useState(false);
  const [saving, setSaving] = useState(false);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updatePerson(person.id, {
        name,
        role,
        maxShiftsPerWeek: maxShifts ? Number(maxShifts) : null,
        maxHoursPerWeek: maxHours ? Number(maxHours) : null,
        allowedAssignmentIds: allowedIds,
      });
      await onRefresh();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`Staff Profile — ${person.name}`} onClose={onClose} maxWidth="max-w-xl">
      <div className="space-y-5">
        <form onSubmit={saveProfile} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Role</label>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Max Shifts / Week
              </label>
              <input
                type="number"
                value={maxShifts}
                onChange={(e) => setMaxShifts(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Max Hours / Week
              </label>
              <input
                type="number"
                value={maxHours}
                onChange={(e) => setMaxHours(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-700">
              Allowed Assignments
            </label>
            <div className="flex flex-wrap gap-1.5">
              {assignmentTypes.map((at) => {
                const active = allowedIds.includes(at.id);
                return (
                  <button
                    key={at.id}
                    type="button"
                    onClick={() =>
                      setAllowedIds((prev) =>
                        active ? prev.filter((id) => id !== at.id) : [...prev, at.id]
                      )
                    }
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                      active
                        ? 'border-blue-600 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    {active && <Check className="h-3 w-3" />}
                    <span>{at.shortCode}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>

        {/* Personal ICS Feed Section */}
        {calendarToken && (
          <div className="border-t border-slate-200 pt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <Calendar className="h-3.5 w-3.5 text-blue-600" />
                <span>Personal .ics Calendar Feed</span>
              </div>
              <button
                type="button"
                disabled={rotatingToken}
                onClick={async () => {
                  setRotatingToken(true);
                  try {
                    const res = await api.rotateCalendarToken(person.id);
                    setCalendarToken(res.calendarToken);
                    await onRefresh();
                  } finally {
                    setRotatingToken(false);
                  }
                }}
                className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-3 w-3" />
                <span>{rotatingToken ? 'Regenerating...' : 'Regenerate Link'}</span>
              </button>
            </div>
            <input
              readOnly
              value={`${window.location.origin}/api/calendar/${calendarToken}.ics`}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600"
            />
          </div>
        )}

      </div>
    </ModalShell>
  );
};

// 4. Staff Roster Modal
export const RosterModal: React.FC<{
  people: Person[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSelectPerson: (p: Person) => void;
}> = ({ people, onClose, onRefresh, onSelectPerson }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !role.trim()) return;
    setAdding(true);
    try {
      await api.createPerson({ name: name.trim(), role: role.trim() });
      setName('');
      setRole('');
      await onRefresh();
    } finally {
      setAdding(false);
    }
  };

  return (
    <ModalShell title={`Staff Roster (${people.length})`} onClose={onClose} maxWidth="max-w-xl">
      <div className="space-y-4">
        <form onSubmit={handleAdd} className="flex flex-wrap gap-2 rounded-lg bg-slate-50 p-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full Name (e.g., Dr. Jane Doe)"
            className="h-8 flex-1 min-w-[160px] rounded border border-slate-200 bg-white px-2.5 text-xs"
          />
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role (e.g., Attending)"
            className="h-8 flex-1 min-w-[130px] rounded border border-slate-200 bg-white px-2.5 text-xs"
          />
          <button
            type="submit"
            disabled={adding}
            className="inline-flex h-8 items-center gap-1 rounded bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Staff</span>
          </button>
        </form>

        <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {people.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-3 py-2 text-xs">
              <div>
                <div className="font-semibold text-slate-900">{p.name}</div>
                <div className="text-[11px] text-slate-500">{p.role}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelectPerson(p);
                  }}
                  className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Edit Profile
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm(`Remove ${p.name} and their shifts?`)) {
                      await api.deletePerson(p.id);
                      await onRefresh();
                    }
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
};

// 5. Categories & Assignment Types Modal
export const CategoriesAssignmentsModal: React.FC<{
  categories: Category[];
  assignmentTypes: AssignmentType[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}> = ({ categories, assignmentTypes, onClose, onRefresh }) => {
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState('');

  const [editingAtId, setEditingAtId] = useState<string | null>(null);
  const [atName, setAtName] = useState('');
  const [atCode, setAtCode] = useState('');
  const [atCatId, setAtCatId] = useState(categories[0]?.id ?? '');
  const [atColor, setAtColor] = useState('#2563EB');
  const [atBlock, setAtBlock] = useState('Full Day');
  const [atStart, setAtStart] = useState('08:00');
  const [atEnd, setAtEnd] = useState('17:00');
  const [atTarget, setAtTarget] = useState(1);
  const [atKey, setAtKey] = useState('');
  const [atDays, setAtDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [error, setError] = useState('');

  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const resetAtForm = () => {
    setEditingAtId(null);
    setAtName('');
    setAtCode('');
    setAtCatId(categories[0]?.id ?? '');
    setAtColor('#2563EB');
    setAtBlock('Full Day');
    setAtStart('08:00');
    setAtEnd('17:00');
    setAtTarget(1);
    setAtKey('');
    setAtDays([1, 2, 3, 4, 5]);
    setError('');
  };

  const startEditAt = (at: AssignmentType) => {
    setError('');
    setEditingAtId(at.id);
    setAtCatId(at.categoryId);
    setAtName(at.name);
    setAtCode(at.shortCode);
    setAtColor(at.colorHex);
    setAtBlock(at.timeBlockLabel);
    setAtStart(at.startTime);
    setAtEnd(at.endTime);
    setAtTarget(at.requiredStaffPerDay ?? 1);
    setAtKey(at.shortcutKey ?? '');
    setAtDays([...at.allowedDaysOfWeek].sort());
  };

  const createCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setError('');
    try {
      await api.createCategory(newCatName.trim());
      setNewCatName('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category');
    }
  };

  const saveCategoryEdit = async (id: string) => {
    if (!editingCatName.trim()) return;
    setError('');
    try {
      await api.updateCategory(id, { name: editingCatName.trim() });
      setEditingCatId(null);
      setEditingCatName('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update category');
    }
  };

  const submitAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        categoryId: atCatId || categories[0]?.id,
        name: atName,
        shortCode: atCode,
        colorHex: atColor,
        timeBlockLabel: atBlock,
        startTime: atStart,
        endTime: atEnd,
        requiredStaffPerDay: atTarget,
        shortcutKey: atKey || null,
        allowedDaysOfWeek: atDays,
      };
      if (editingAtId) {
        await api.updateAssignmentType(editingAtId, payload);
      } else {
        await api.createAssignmentType(payload);
      }
      resetAtForm();
      await onRefresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : editingAtId
            ? 'Failed to update assignment type'
            : 'Failed to create assignment type'
      );
    }
  };

  return (
    <ModalShell title="Categories & Assignment Types" onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-5">
        {/* Categories */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Categories
          </h3>
          <form onSubmit={createCategory} className="mb-2 flex gap-2">
            <input
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="New category name..."
              className="h-7 flex-1 rounded border border-slate-200 px-2.5 text-xs"
            />
            <button
              type="submit"
              className="h-7 rounded bg-slate-900 px-3 text-xs font-medium text-white hover:bg-slate-800"
            >
              Add Category
            </button>
          </form>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => {
              const isEditing = editingCatId === c.id;
              if (isEditing) {
                return (
                  <div
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs"
                  >
                    <input
                      autoFocus
                      value={editingCatName}
                      onChange={(e) => setEditingCatName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          saveCategoryEdit(c.id);
                        } else if (e.key === 'Escape') {
                          setEditingCatId(null);
                        }
                      }}
                      className="h-5 w-32 rounded border border-blue-200 bg-white px-1.5 text-xs text-slate-900 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => saveCategoryEdit(c.id)}
                      title="Save category"
                      className="rounded p-0.5 text-emerald-700 hover:bg-emerald-100"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCatId(null)}
                      title="Cancel"
                      className="rounded p-0.5 text-slate-500 hover:bg-slate-200"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              }
              return (
                <div
                  key={c.id}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800"
                >
                  <span>{c.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCatId(c.id);
                      setEditingCatName(c.name);
                    }}
                    title="Rename category"
                    className="text-slate-400 hover:text-blue-600"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm(`Delete category "${c.name}" and its assignment types?`)) {
                        await api.deleteCategory(c.id);
                        await onRefresh();
                      }
                    }}
                    title="Delete category"
                    className="text-slate-400 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Assignment Types */}
        <div className="border-t border-slate-200 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Assignment Types
            </h3>
            {editingAtId && (
              <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                Editing: {atCode || atName}
              </span>
            )}
          </div>
          <form
            onSubmit={submitAssignment}
            className={`mb-3 space-y-2.5 rounded-lg p-3 ${
              editingAtId ? 'border border-blue-200 bg-blue-50/40' : 'bg-slate-50'
            }`}
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <select
                value={atCatId}
                onChange={(e) => setAtCatId(e.target.value)}
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                required
                value={atName}
                onChange={(e) => setAtName(e.target.value)}
                placeholder="Name (e.g. Swing Shift)"
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
              />
              <input
                required
                value={atCode}
                onChange={(e) => setAtCode(e.target.value)}
                placeholder="Code (e.g. SWG)"
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs uppercase"
              />
              <div className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={atColor}
                  onChange={(e) => setAtColor(e.target.value)}
                  className="h-7 w-10 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
                />
                <span
                  style={{ backgroundColor: atColor, color: getContrastTextColor(atColor) }}
                  className="rounded px-2 py-0.5 text-[11px] font-semibold"
                >
                  {atCode || 'CODE'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <input
                value={atBlock}
                onChange={(e) => setAtBlock(e.target.value)}
                placeholder="Block (AM/PM/Full)"
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
              />
              <input
                type="time"
                value={atStart}
                onChange={(e) => setAtStart(e.target.value)}
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
              />
              <input
                type="time"
                value={atEnd}
                onChange={(e) => setAtEnd(e.target.value)}
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
              />
              <input
                type="number"
                min={0}
                value={atTarget}
                onChange={(e) => setAtTarget(Number(e.target.value))}
                placeholder="Staff/day"
                title="Required staff per day"
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
              />
              <input
                maxLength={1}
                value={atKey}
                onChange={(e) => setAtKey(e.target.value)}
                placeholder="Key (1-9)"
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-500 mr-1">Allowed Days:</span>
                {dayNames.map((dn, idx) => {
                  const active = atDays.includes(idx);
                  return (
                    <button
                      key={dn}
                      type="button"
                      onClick={() =>
                        setAtDays((prev) =>
                          active ? prev.filter((d) => d !== idx) : [...prev, idx].sort()
                        )
                      }
                      className={`h-6 w-6 rounded text-[10px] font-semibold ${
                        active ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-500'
                      }`}
                    >
                      {dn}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5">
                {editingAtId && (
                  <button
                    type="button"
                    onClick={resetAtForm}
                    className="h-7 rounded border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  className="inline-flex h-7 items-center gap-1 rounded bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700"
                >
                  {editingAtId ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Save Changes</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Assignment</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </form>

          <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {assignmentTypes.map((at) => (
              <div
                key={at.id}
                className={`flex items-center justify-between px-3 py-2 text-xs ${
                  editingAtId === at.id ? 'bg-blue-50/60' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      backgroundColor: at.colorHex,
                      color: getContrastTextColor(at.colorHex),
                    }}
                    className="rounded px-2 py-0.5 font-semibold"
                  >
                    {at.shortCode}
                  </span>
                  <div>
                    <div className="font-semibold text-slate-900">
                      {at.name}{' '}
                      {at.shortcutKey && (
                        <kbd className="ml-1 rounded bg-slate-100 px-1 text-[10px] text-slate-600">
                          [{at.shortcutKey}]
                        </kbd>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {at.timeBlockLabel} ({at.startTime}–{at.endTime}) • Target:{' '}
                      {at.requiredStaffPerDay ?? 1}/day
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEditAt(at)}
                    title="Edit assignment type"
                    className="rounded p-1 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (confirm(`Delete assignment "${at.name}"?`)) {
                        if (editingAtId === at.id) resetAtForm();
                        await api.deleteAssignmentType(at.id);
                        await onRefresh();
                      }
                    }}
                    title="Delete assignment type"
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  );
};

// 6. Admin Settings Modal (Password + Database Backup & Restore)
export const SettingsModal: React.FC<{
  onClose: () => void;
  onRefresh?: () => Promise<void>;
}> = ({ onClose, onRefresh }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const [restorePreview, setRestorePreview] = useState<{
    filename: string;
    counts: Record<string, number>;
    bundle: unknown;
  } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [exportSections, setExportSections] = useState<string[]>([
    'people',
    'categories',
    'assignments',
    'rules',
    'templates',
  ]);
  const [configPreview, setConfigPreview] = useState<{
    filename: string;
    counts: Record<string, number>;
    bundle: unknown;
  } | null>(null);
  const [importSections, setImportSections] = useState<string[]>([
    'people',
    'categories',
    'assignments',
    'rules',
    'templates',
  ]);
  const [importMode, setImportMode] = useState<'MERGE' | 'REPLACE_SELECTED'>('MERGE');
  const [importingConfig, setImportingConfig] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);

  const CONFIG_SECTIONS: { id: string; label: string; countKey: string }[] = [
    { id: 'people', label: 'Staff Roster', countKey: 'people' },
    { id: 'categories', label: 'Categories', countKey: 'categories' },
    { id: 'assignments', label: 'Assignments', countKey: 'assignmentTypes' },
    { id: 'rules', label: 'Rules', countKey: 'constraintRules' },
    { id: 'templates', label: 'Rotation Templates', countKey: 'scheduleTemplates' },
  ];

  const toggleSection = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((s) => s !== id) : [...list, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      setStatus({ type: 'ok', msg: 'Admin password updated successfully.' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Update failed' });
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || parsed.version !== 1 || !parsed.data) {
        throw new Error('Invalid scheduler backup JSON file.');
      }
      setRestorePreview({
        filename: file.name,
        counts: parsed.counts ?? {},
        bundle: parsed,
      });
    } catch (err) {
      setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Failed to parse JSON' });
    }
  };

  const handleConfirmRestore = async () => {
    if (!restorePreview) return;
    setRestoring(true);
    setStatus(null);
    try {
      await api.restoreBackup(restorePreview.bundle);
      setStatus({ type: 'ok', msg: 'Database restored atomically from JSON backup.' });
      setRestorePreview(null);
      if (onRefresh) await onRefresh();
    } catch (err) {
      setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Restore failed' });
    } finally {
      setRestoring(false);
    }
  };

  const handleConfigFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || parsed.version !== 1 || !parsed.data) {
        throw new Error('Invalid configuration JSON file.');
      }
      const counts: Record<string, number> = {
        people: Array.isArray(parsed.data.people) ? parsed.data.people.length : 0,
        categories: Array.isArray(parsed.data.categories) ? parsed.data.categories.length : 0,
        assignmentTypes: Array.isArray(parsed.data.assignmentTypes)
          ? parsed.data.assignmentTypes.length
          : 0,
        constraintRules: Array.isArray(parsed.data.constraintRules)
          ? parsed.data.constraintRules.length
          : 0,
        scheduleTemplates: Array.isArray(parsed.data.scheduleTemplates)
          ? parsed.data.scheduleTemplates.length
          : 0,
      };
      const available = CONFIG_SECTIONS.filter((s) => (counts[s.countKey] ?? 0) > 0).map((s) => s.id);
      setImportSections(available.length > 0 ? available : CONFIG_SECTIONS.map((s) => s.id));
      setConfigPreview({
        filename: file.name,
        counts,
        bundle: parsed,
      });
    } catch (err) {
      setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Failed to parse JSON' });
    }
  };

  const handleConfirmConfigImport = async () => {
    if (!configPreview || importSections.length === 0) return;
    setImportingConfig(true);
    setStatus(null);
    try {
      const res = await api.importConfig(configPreview.bundle, importSections, importMode);
      const summary = [
        res.imported.people ? `${res.imported.people} staff` : null,
        res.imported.categories ? `${res.imported.categories} categories` : null,
        res.imported.assignmentTypes ? `${res.imported.assignmentTypes} assignments` : null,
        res.imported.constraintRules ? `${res.imported.constraintRules} rules` : null,
        res.imported.scheduleTemplates ? `${res.imported.scheduleTemplates} templates` : null,
      ]
        .filter(Boolean)
        .join(', ');
      setStatus({
        type: 'ok',
        msg: summary ? `Configuration imported (${summary}).` : 'Configuration import completed.',
      });
      setConfigPreview(null);
      if (onRefresh) await onRefresh();
    } catch (err) {
      setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Config import failed' });
    } finally {
      setImportingConfig(false);
    }
  };

  const handleConfirmReset = async () => {
    if (resetConfirmText.trim().toUpperCase() !== 'RESET') return;
    setResetting(true);
    setStatus(null);
    try {
      await api.resetDatabase();
      setShowResetConfirm(false);
      setResetConfirmText('');
      setStatus({
        type: 'ok',
        msg: 'All people, categories, assignments, shifts, rules, and templates have been cleared.',
      });
      if (onRefresh) await onRefresh();
    } catch (err) {
      setStatus({ type: 'err', msg: err instanceof Error ? err.message : 'Reset failed' });
    } finally {
      setResetting(false);
    }
  };

  return (
    <ModalShell title="Admin Settings & Database Backup" onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-5">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <KeyRound className="h-3.5 w-3.5 text-slate-500" />
            <span>Change Admin Password</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className="w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs"
            />
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 6 chars)"
              className="w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              Update Password
            </button>
          </div>
        </form>

        {/* Database Backup & Restore */}
        <div className="space-y-3 border-t border-slate-200 pt-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <Database className="h-3.5 w-3.5 text-blue-600" />
            <span>Database Backup &amp; Restore</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/admin/backup?format=json"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download JSON Snapshot</span>
            </a>
            <a
              href="/api/admin/backup?format=sql"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download SQL Dump (.sql.gz)</span>
            </a>
          </div>

          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
              <Upload className="h-3.5 w-3.5 text-slate-500" />
              <span>Restore from JSON Snapshot (.json)</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>

            {restorePreview && (
              <div className="mt-2.5 space-y-2 rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-950">
                <div className="font-semibold">Preview: {restorePreview.filename}</div>
                <div className="text-[11px]">
                  People: {restorePreview.counts.people ?? 0} • Shifts:{' '}
                  {restorePreview.counts.shifts ?? 0} • Rules:{' '}
                  {restorePreview.counts.constraintRules ?? 0} • Templates:{' '}
                  {restorePreview.counts.scheduleTemplates ?? 0}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={restoring}
                    onClick={handleConfirmRestore}
                    className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {restoring ? 'Restoring...' : 'Confirm Atomic Restore'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRestorePreview(null)}
                    className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Export / Import Configuration */}
        <div className="space-y-3 border-t border-slate-200 pt-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <Download className="h-3.5 w-3.5 text-emerald-600" />
              <span>Export / Import Configuration</span>
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Selectively export or import staff roster, categories, assignments, rules, and
              rotation templates without touching shifts or admin settings.
            </p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {CONFIG_SECTIONS.map((sec) => (
                <label
                  key={sec.id}
                  className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={exportSections.includes(sec.id)}
                    onChange={() => toggleSection(exportSections, setExportSections, sec.id)}
                    className="rounded border-slate-300"
                  />
                  <span>{sec.label}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {exportSections.length > 0 ? (
                <a
                  href={`/api/admin/config-export?sections=${exportSections.join(',')}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Selected Config (.json)</span>
                </a>
              ) : (
                <span className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-400">
                  <Download className="h-3.5 w-3.5" />
                  <span>Select at least one section</span>
                </span>
              )}

              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <Upload className="h-3.5 w-3.5 text-slate-500" />
                <span>Import Config (.json)</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleConfigFileSelect}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {configPreview && (
            <div className="space-y-2.5 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-slate-800">
              <div className="font-semibold text-blue-950">
                Config Preview: {configPreview.filename}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {CONFIG_SECTIONS.map((sec) => {
                  const count = configPreview.counts[sec.countKey] ?? 0;
                  return (
                    <label
                      key={sec.id}
                      className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={importSections.includes(sec.id)}
                        onChange={() => toggleSection(importSections, setImportSections, sec.id)}
                        className="rounded border-slate-300"
                      />
                      <span>
                        {sec.label} ({count})
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <label className="flex cursor-pointer items-center gap-1.5 font-medium">
                  <input
                    type="radio"
                    name="configImportMode"
                    checked={importMode === 'MERGE'}
                    onChange={() => setImportMode('MERGE')}
                  />
                  <span>Merge (Upsert existing &amp; add new)</span>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 font-medium text-amber-800">
                  <input
                    type="radio"
                    name="configImportMode"
                    checked={importMode === 'REPLACE_SELECTED'}
                    onChange={() => setImportMode('REPLACE_SELECTED')}
                  />
                  <span>Replace Selected Sections</span>
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={importingConfig || importSections.length === 0}
                  onClick={handleConfirmConfigImport}
                  className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {importingConfig ? 'Importing...' : 'Confirm Import'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfigPreview(null)}
                  className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Reset All Data (Start from Scratch) */}
        <div className="space-y-2.5 border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700">
                <Trash2 className="h-3.5 w-3.5" />
                <span>Start from Scratch (Reset All Data)</span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Permanently deletes all staff, categories, assignments, shifts, rules, and
                templates. Your admin password is preserved.
              </p>
            </div>
            {!showResetConfirm && (
              <button
                type="button"
                onClick={() => {
                  setStatus(null);
                  setShowResetConfirm(true);
                }}
                className="shrink-0 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                Reset Data...
              </button>
            )}
          </div>

          {showResetConfirm && (
            <div className="space-y-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-950">
              <div className="font-semibold">
                Are you sure? Download a backup first if you may need this data later.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder='Type "RESET" to confirm'
                  className="w-44 rounded border border-red-300 bg-white px-2.5 py-1 text-xs text-slate-900 focus:border-red-500 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={resetting || resetConfirmText.trim().toUpperCase() !== 'RESET'}
                  onClick={handleConfirmReset}
                  className="rounded bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {resetting ? 'Resetting...' : 'Permanently Wipe & Start Fresh'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetConfirm(false);
                    setResetConfirmText('');
                  }}
                  className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {status && (
          <p className={`text-xs font-medium ${status.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
            {status.msg}
          </p>
        )}
      </div>
    </ModalShell>
  );
};

// 7. Milestone 2 Hook Modal
export const Milestone2HookModal: React.FC<{ label: string; onClose: () => void }> = ({
  label,
  onClose,
}) => (
  <ModalShell title={label} onClose={onClose} maxWidth="max-w-sm">
    <div className="space-y-3 text-xs text-slate-600">
      <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-blue-900">
        <Sparkles className="h-4 w-4 shrink-0 text-blue-600" />
        <span>
          <strong>{label}</strong> is scheduled for <strong>Milestone 2</strong>. The database schema
          and toolbar hook points are already in place.
        </span>
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
        >
          Close
        </button>
      </div>
    </div>
  </ModalShell>
);
