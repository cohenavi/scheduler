import React, { useState } from 'react';
import {
  Calendar,
  Check,
  Database,
  Download,
  KeyRound,
  Plus,
  RefreshCw,
  Slash,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../api';
import type { AssignmentType, Category, Person, TimeBlock, Unavailability } from '../types';
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

// 2. Keyboard Shortcuts Legend Modal
export const ShortcutsModal: React.FC<{
  onClose: () => void;
  assignmentTypes: AssignmentType[];
}> = ({ onClose, assignmentTypes }) => {
  const shortcuts = [
    ['Click / Drag', 'Select single cell or marquee range'],
    ['Shift + Click / Arrows', 'Extend rectangular selection'],
    ['Ctrl/Cmd + A', 'Select all visible cells'],
    ['1 – 5 (or custom key)', 'Batch-assign to unlocked, non-PTO cells'],
    ['N or Double-Click', 'Add or edit shift note (max 160 chars)'],
    ['L', 'Lock / unlock shifts in selection'],
    ['U', 'Toggle Full-Day PTO / Unavailability'],
    ['Ctrl/Cmd + C / X / V', 'Copy / Cut / Paste 2D shift pattern'],
    ['Delete / Backspace', 'Delete unlocked shifts in selection'],
    ['Ctrl/Cmd + Z', 'Undo last single or batch grid change'],
    ['Escape', 'Close popover or clear selection'],
    ['?', 'Show this shortcuts legend'],
  ];

  return (
    <ModalShell title="Keyboard Shortcuts" onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {shortcuts.map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between px-3 py-2 text-xs">
              <span className="text-slate-600">{desc}</span>
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-800">
                {key}
              </kbd>
            </div>
          ))}
        </div>

        {assignmentTypes.some((a) => a.shortcutKey) && (
          <div>
            <h4 className="mb-1.5 text-xs font-semibold text-slate-700">Assignment Hotkeys</h4>
            <div className="flex flex-wrap gap-1.5">
              {assignmentTypes
                .filter((a) => a.shortcutKey)
                .map((a) => (
                  <span
                    key={a.id}
                    style={{ backgroundColor: a.colorHex, color: getContrastTextColor(a.colorHex) }}
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold"
                  >
                    <kbd className="font-mono">[{a.shortcutKey}]</kbd> {a.shortCode} — {a.name}
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
};

// 3. Person Profile & PTO Drawer
export const PersonDrawer: React.FC<{
  person: Person;
  assignmentTypes: AssignmentType[];
  unavailabilities: Unavailability[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}> = ({ person, assignmentTypes, unavailabilities, onClose, onRefresh }) => {
  const [name, setName] = useState(person.name);
  const [role, setRole] = useState(person.role);
  const [maxShifts, setMaxShifts] = useState(person.maxShiftsPerWeek?.toString() ?? '');
  const [maxHours, setMaxHours] = useState(person.maxHoursPerWeek?.toString() ?? '');
  const [allowedIds, setAllowedIds] = useState<string[]>(person.allowedAssignmentIds ?? []);
  const [calendarToken, setCalendarToken] = useState(person.calendarToken ?? '');
  const [rotatingToken, setRotatingToken] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add PTO form
  const [ptoDate, setPtoDate] = useState('');
  const [ptoBlock, setPtoBlock] = useState<TimeBlock>('FULL_DAY');
  const [ptoStart, setPtoStart] = useState('08:00');
  const [ptoEnd, setPtoEnd] = useState('12:00');
  const [ptoNote, setPtoNote] = useState('');

  const personUnavails = unavailabilities
    .filter((u) => u.personId === person.id)
    .sort((a, b) => a.date.localeCompare(b.date));

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

  const addPto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ptoDate) return;
    await api.toggleUnavailability({
      personId: person.id,
      date: ptoDate,
      timeBlock: ptoBlock,
      startTime: ptoBlock === 'CUSTOM' ? ptoStart : null,
      endTime: ptoBlock === 'CUSTOM' ? ptoEnd : null,
      note: ptoNote || null,
    });
    setPtoDate('');
    setPtoNote('');
    await onRefresh();
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

        {/* PTO / Unavailability Section */}
        <div className="border-t border-slate-200 pt-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <Slash className="h-3.5 w-3.5 text-slate-500" />
            <span>PTO &amp; Unavailability</span>
          </h3>

          <form onSubmit={addPto} className="mb-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2.5">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Date</label>
              <input
                type="date"
                required
                value={ptoDate}
                onChange={(e) => setPtoDate(e.target.value)}
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Block</label>
              <select
                value={ptoBlock}
                onChange={(e) => setPtoBlock(e.target.value as TimeBlock)}
                className="h-7 rounded border border-slate-200 bg-white px-2 text-xs"
              >
                <option value="FULL_DAY">Full Day</option>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
                <option value="CUSTOM">Custom Hours</option>
              </select>
            </div>
            {ptoBlock === 'CUSTOM' && (
              <>
                <input
                  type="time"
                  value={ptoStart}
                  onChange={(e) => setPtoStart(e.target.value)}
                  className="h-7 rounded border border-slate-200 bg-white px-1.5 text-xs"
                />
                <input
                  type="time"
                  value={ptoEnd}
                  onChange={(e) => setPtoEnd(e.target.value)}
                  className="h-7 rounded border border-slate-200 bg-white px-1.5 text-xs"
                />
              </>
            )}
            <div className="flex-1 min-w-[120px]">
              <label className="mb-1 block text-[11px] font-medium text-slate-600">Admin Note</label>
              <input
                type="text"
                value={ptoNote}
                onChange={(e) => setPtoNote(e.target.value)}
                placeholder="Optional reason..."
                className="h-7 w-full rounded border border-slate-200 bg-white px-2 text-xs"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-7 items-center gap-1 rounded bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add</span>
            </button>
          </form>

          <div className="max-h-40 space-y-1 overflow-y-auto">
            {personUnavails.length === 0 ? (
              <p className="text-xs text-slate-400">No PTO / unavailability entries.</p>
            ) : (
              personUnavails.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded border border-slate-200 px-2.5 py-1.5 text-xs"
                >
                  <div>
                    <span className="font-semibold text-slate-800 tabular-nums">{u.date}</span>
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                      {u.timeBlock}
                    </span>
                    {u.note && <span className="ml-2 text-slate-500">{u.note}</span>}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await api.deleteUnavailability(u.id);
                      await onRefresh();
                    }}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
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
                  Edit / PTO
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

  const createCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    await api.createCategory(newCatName.trim());
    setNewCatName('');
    await onRefresh();
  };

  const createAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.createAssignmentType({
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
      });
      setAtName('');
      setAtCode('');
      setAtKey('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create assignment type');
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
            {categories.map((c) => (
              <div
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800"
              >
                <span>{c.name}</span>
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm(`Delete category "${c.name}" and its assignment types?`)) {
                      await api.deleteCategory(c.id);
                      await onRefresh();
                    }
                  }}
                  className="text-slate-400 hover:text-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Assignment Types */}
        <div className="border-t border-slate-200 pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
            Assignment Types
          </h3>
          <form onSubmit={createAssignment} className="mb-3 space-y-2.5 rounded-lg bg-slate-50 p-3">
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
              <button
                type="submit"
                className="inline-flex h-7 items-center gap-1 rounded bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Assignment</span>
              </button>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </form>

          <div className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {assignmentTypes.map((at) => (
              <div key={at.id} className="flex items-center justify-between px-3 py-2 text-xs">
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
                      {at.timeBlockLabel} ({at.startTime}–{at.endTime}) • Target: {at.requiredStaffPerDay ?? 1}/day
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm(`Delete assignment "${at.name}"?`)) {
                      await api.deleteAssignmentType(at.id);
                      await onRefresh();
                    }
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
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
