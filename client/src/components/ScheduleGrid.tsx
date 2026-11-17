import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Lock,
  MessageSquare,
  Plus,
  Slash,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { matchesCombo, type ShortcutMap } from '../shortcuts';
import type {
  AssignmentType,
  Category,
  CellCoord,
  ClipboardItem,
  ClipboardState,
  ConstraintViolation,
  GridDisplayMode,
  Person,
  Shift,
  Unavailability,
} from '../types';
import {
  buildInitialsMap,
  compareShiftsByTime,
  formatDayHeader,
  formatLongDate,
  getContrastTextColor,
  getShiftHours,
} from '../utils';

interface ScheduleGridProps {
  days: string[];
  people: Person[];
  categories: Category[];
  assignmentTypes: AssignmentType[];
  shifts: Shift[];
  violations?: ConstraintViolation[];
  isAdmin: boolean;
  canEdit: boolean; // true only when isAdmin && adminViewMode === 'DRAFT'
  gridDisplayMode: GridDisplayMode;
  shortcuts: ShortcutMap;
  selectedCells: CellCoord[];
  anchor: CellCoord | null;
  focus: CellCoord | null;
  onChangeSelection: (anchor: CellCoord | null, focus: CellCoord | null) => void;
  onBatchAssign: (assignmentTypeId: string, cells: Array<{ personId: string; date: string }>) => void;
  onBatchDelete: (cells: Array<{ personId: string; date: string }>) => void;
  onBatchLock: (isLocked: boolean, cells: Array<{ personId: string; date: string }>) => void;
  onUpdateShiftNote: (shiftId: string, note: string | null) => Promise<void>;
  onDeleteShift: (shiftId: string) => Promise<void>;
  onToggleShiftLock: (shift: Shift) => Promise<void>;
  onMoveShift: (shiftId: string, targetPersonId: string, targetDate: string) => void;
  onPaste: (
    items: Array<{
      personId: string;
      date: string;
      assignmentTypeId: string;
      note?: string | null;
      customStartTime?: string | null;
      customEndTime?: string | null;
    }>,
    targetCells: Array<{ personId: string; date: string }>
  ) => void;
  onUndo: () => void;
  onOpenPersonDrawer: (person: Person) => void;
  onOpenShortcuts: () => void;
}

export const ScheduleGrid: React.FC<ScheduleGridProps> = ({
  days,
  people,
  categories,
  assignmentTypes,
  shifts,
  violations = [],
  isAdmin,
  canEdit,
  gridDisplayMode,
  shortcuts,
  anchor,
  focus,
  onChangeSelection,
  onBatchAssign,
  onBatchDelete,
  onBatchLock,
  onUpdateShiftNote,
  onDeleteShift,
  onToggleShiftLock,
  onMoveShift,
  onPaste,
  onUndo,
  onOpenPersonDrawer,
}) => {
  const [isDraggingMarquee, setIsDraggingMarquee] = useState(false);
  const dragStartCellRef = useRef<CellCoord | null>(null);
  const didMarqueeMoveRef = useRef(false);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [noteEditor, setNoteEditor] = useState<{
    shift: Shift;
    value: string;
    x: number;
    y: number;
  } | null>(null);
  const [cellEditor, setCellEditor] = useState<
    | { mode: 'person'; personId: string; date: string; x: number; y: number }
    | { mode: 'assignment'; assignmentTypeId: string; date: string; x: number; y: number }
    | null
  >(null);
  const [savingNote, setSavingNote] = useState(false);
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);

  const { violationsByShiftId, quotaViolationsByPersonId } = useMemo(() => {
    const shiftMap = new Map<string, ConstraintViolation[]>();
    const personMap = new Map<string, ConstraintViolation[]>();
    for (const v of violations) {
      if (v.shiftId) {
        const arr = shiftMap.get(v.shiftId) ?? [];
        arr.push(v);
        shiftMap.set(v.shiftId, arr);
      } else {
        const arr = personMap.get(v.personId) ?? [];
        arr.push(v);
        personMap.set(v.personId, arr);
      }
    }
    return { violationsByShiftId: shiftMap, quotaViolationsByPersonId: personMap };
  }, [violations]);

  const assignmentMap = useMemo(
    () => new Map(assignmentTypes.map((a) => [a.id, a])),
    [assignmentTypes]
  );

  const personMap = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const initialsMap = useMemo(() => buildInitialsMap(people), [people]);

  // Index shifts and unavailabilities by "personId::date"
  const shiftsByCell = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of shifts) {
      const key = `${s.personId}::${s.date}`;
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => compareShiftsByTime(a, b, assignmentMap));
      map.set(k, list);
    }
    return map;
  }, [shifts, assignmentMap]);

  // Index shifts by "assignmentTypeId::date" for Assignment-focused display mode
  const shiftsByAssignmentCell = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const s of shifts) {
      const key = `${s.assignmentTypeId}::${s.date}`;
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => {
        const pA = personMap.get(a.personId)?.name ?? '';
        const pB = personMap.get(b.personId)?.name ?? '';
        return pA.localeCompare(pB);
      });
      map.set(k, list);
    }
    return map;
  }, [shifts, personMap]);

  // Per-person stats (for Admin left column)
  const personStats = useMemo(() => {
    const map = new Map<string, { count: number; hours: number }>();
    for (const s of shifts) {
      const prev = map.get(s.personId) ?? { count: 0, hours: 0 };
      prev.count += 1;
      prev.hours += getShiftHours(s, assignmentMap);
      map.set(s.personId, prev);
    }
    return map;
  }, [shifts, assignmentMap]);

  // Per-day coverage counts (Admin header)
  const dayCoverage = useMemo(() => {
    const map = new Map<string, { filled: number; required: number }>();
    for (const date of days) {
      const { dayOfWeek } = formatDayHeader(date);
      let required = 0;
      for (const at of assignmentTypes) {
        if (at.allowedDaysOfWeek.includes(dayOfWeek)) {
          required += at.requiredStaffPerDay ?? 1;
        }
      }
      const filled = shifts.filter((s) => s.date === date).length;
      map.set(date, { filled, required });
    }
    return map;
  }, [days, assignmentTypes, shifts]);

  // Compute rectangular selection bounds
  const selectionBounds = useMemo(() => {
    if (!anchor || !focus || people.length === 0 || days.length === 0) return null;
    const minRow = Math.max(0, Math.min(anchor.row, focus.row));
    const maxRow = Math.min(people.length - 1, Math.max(anchor.row, focus.row));
    const minCol = Math.max(0, Math.min(anchor.col, focus.col));
    const maxCol = Math.min(days.length - 1, Math.max(anchor.col, focus.col));
    return {
      minRow,
      maxRow,
      minCol,
      maxCol,
      rowCount: maxRow - minRow + 1,
      colCount: maxCol - minCol + 1,
    };
  }, [anchor, focus, people.length, days.length]);

  const getSelectedCellRefs = useCallback((): Array<{ personId: string; date: string }> => {
    if (!selectionBounds) return [];
    const cells: Array<{ personId: string; date: string }> = [];
    for (let r = selectionBounds.minRow; r <= selectionBounds.maxRow; r++) {
      for (let c = selectionBounds.minCol; c <= selectionBounds.maxCol; c++) {
        const person = people[r];
        const date = days[c];
        if (person && date) {
          cells.push({ personId: person.id, date });
        }
      }
    }
    return cells;
  }, [selectionBounds, people, days]);

  useEffect(() => {
    const handleMouseUp = () => setIsDraggingMarquee(false);
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  useEffect(() => {
    if (noteEditor) {
      setTimeout(() => noteInputRef.current?.focus(), 10);
    }
  }, [noteEditor]);

  const openNoteEditorForShift = useCallback((shift: Shift, rect?: DOMRect) => {
    const x = rect ? Math.min(rect.left, window.innerWidth - 290) : window.innerWidth / 2 - 140;
    const y = rect ? Math.min(rect.bottom + 6, window.innerHeight - 170) : window.innerHeight / 2 - 80;
    setNoteEditor({
      shift,
      value: shift.note || '',
      x: Math.max(12, x),
      y: Math.max(12, y),
    });
  }, []);

  const openCellEditorForPerson = useCallback((personId: string, date: string, rect?: DOMRect) => {
    const popW = 320;
    const popH = 380;
    const x = rect ? Math.min(rect.left, window.innerWidth - popW - 12) : window.innerWidth / 2 - popW / 2;
    const y = rect
      ? rect.bottom + popH > window.innerHeight
        ? Math.max(12, rect.top - popH - 6)
        : rect.bottom + 6
      : window.innerHeight / 2 - popH / 2;
    setCellEditor({ mode: 'person', personId, date, x: Math.max(12, x), y: Math.max(12, y) });
  }, []);

  const openCellEditorForAssignment = useCallback(
    (assignmentTypeId: string, date: string, rect?: DOMRect) => {
      const popW = 320;
      const popH = 380;
      const x = rect ? Math.min(rect.left, window.innerWidth - popW - 12) : window.innerWidth / 2 - popW / 2;
      const y = rect
        ? rect.bottom + popH > window.innerHeight
          ? Math.max(12, rect.top - popH - 6)
          : rect.bottom + 6
        : window.innerHeight / 2 - popH / 2;
      setCellEditor({
        mode: 'assignment',
        assignmentTypeId,
        date,
        x: Math.max(12, x),
        y: Math.max(12, y),
      });
    },
    []
  );

  // Keyboard shortcuts handler
  useEffect(() => {
    if (!canEdit) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        if (e.key === 'Escape' && noteEditor) {
          e.preventDefault();
          setNoteEditor(null);
        }
        return;
      }

      // If any modal is open (other than grid), skip
      if (document.querySelector('[data-modal-open="true"]')) {
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (noteEditor) {
          setNoteEditor(null);
        } else if (cellEditor) {
          setCellEditor(null);
        } else if (clipboard) {
          setClipboard(null);
        } else {
          onChangeSelection(null, null);
        }
        return;
      }

      // Undo
      if (matchesCombo(e, shortcuts.undo)) {
        e.preventDefault();
        onUndo();
        return;
      }

      // Select all visible cells
      if (matchesCombo(e, shortcuts.selectAll)) {
        e.preventDefault();
        if (gridDisplayMode === 'person' && people.length > 0 && days.length > 0) {
          onChangeSelection({ row: 0, col: 0 }, { row: people.length - 1, col: days.length - 1 });
        }
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;

      // Arrow navigation
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        if (people.length === 0 || days.length === 0) return;
        const cur = focus ?? { row: 0, col: 0 };
        let nextRow = cur.row;
        let nextCol = cur.col;
        if (e.key === 'ArrowUp') nextRow = Math.max(0, cur.row - 1);
        if (e.key === 'ArrowDown') nextRow = Math.min(people.length - 1, cur.row + 1);
        if (e.key === 'ArrowLeft') nextCol = Math.max(0, cur.col - 1);
        if (e.key === 'ArrowRight') nextCol = Math.min(days.length - 1, cur.col + 1);
        const nextCoord = { row: nextRow, col: nextCol };
        if (e.shiftKey && anchor) {
          onChangeSelection(anchor, nextCoord);
        } else {
          onChangeSelection(nextCoord, nextCoord);
        }
        return;
      }

      // Operations requiring a selection (Person-focused grid)
      if (gridDisplayMode !== 'person' || !selectionBounds) return;
      const cells = getSelectedCellRefs();
      if (cells.length === 0) return;

      // Copy
      if (matchesCombo(e, shortcuts.copy)) {
        e.preventDefault();
        const items: ClipboardItem[] = [];
        const sourceKeys = new Set<string>();
        for (let r = selectionBounds.minRow; r <= selectionBounds.maxRow; r++) {
          for (let c = selectionBounds.minCol; c <= selectionBounds.maxCol; c++) {
            const p = people[r];
            const d = days[c];
            if (!p || !d) continue;
            const key = `${p.id}::${d}`;
            sourceKeys.add(key);
            const cellShifts = shiftsByCell.get(key) ?? [];
            for (const s of cellShifts) {
              items.push({
                rowOffset: r - selectionBounds.minRow,
                colOffset: c - selectionBounds.minCol,
                assignmentTypeId: s.assignmentTypeId,
                note: s.note,
                customStartTime: s.customStartTime,
                customEndTime: s.customEndTime,
              });
            }
          }
        }
        setClipboard({ items, sourceKeys, isCut: false });
        return;
      }

      // Cut
      if (matchesCombo(e, shortcuts.cut)) {
        e.preventDefault();
        const items: ClipboardItem[] = [];
        const sourceKeys = new Set<string>();
        for (let r = selectionBounds.minRow; r <= selectionBounds.maxRow; r++) {
          for (let c = selectionBounds.minCol; c <= selectionBounds.maxCol; c++) {
            const p = people[r];
            const d = days[c];
            if (!p || !d) continue;
            const key = `${p.id}::${d}`;
            sourceKeys.add(key);
            const cellShifts = shiftsByCell.get(key) ?? [];
            for (const s of cellShifts) {
              items.push({
                rowOffset: r - selectionBounds.minRow,
                colOffset: c - selectionBounds.minCol,
                assignmentTypeId: s.assignmentTypeId,
                note: s.note,
                customStartTime: s.customStartTime,
                customEndTime: s.customEndTime,
              });
            }
          }
        }
        setClipboard({ items, sourceKeys, isCut: true });
        onBatchDelete(cells);
        return;
      }

      // Paste
      if (matchesCombo(e, shortcuts.paste)) {
        e.preventDefault();
        if (!clipboard || !focus) return;
        const startRow = selectionBounds.minRow;
        const startCol = selectionBounds.minCol;
        const pasteItems: Array<{
          personId: string;
          date: string;
          assignmentTypeId: string;
          note?: string | null;
          customStartTime?: string | null;
          customEndTime?: string | null;
        }> = [];
        const targetCellsMap = new Map<string, { personId: string; date: string }>();

        // Determine bounding box of clipboard
        let maxR = 0;
        let maxC = 0;
        for (const item of clipboard.items) {
          if (item.rowOffset > maxR) maxR = item.rowOffset;
          if (item.colOffset > maxC) maxC = item.colOffset;
        }
        for (let rOff = 0; rOff <= maxR; rOff++) {
          for (let cOff = 0; cOff <= maxC; cOff++) {
            const p = people[startRow + rOff];
            const d = days[startCol + cOff];
            if (p && d) {
              targetCellsMap.set(`${p.id}::${d}`, { personId: p.id, date: d });
            }
          }
        }

        for (const item of clipboard.items) {
          const p = people[startRow + item.rowOffset];
          const d = days[startCol + item.colOffset];
          if (p && d) {
            pasteItems.push({
              personId: p.id,
              date: d,
              assignmentTypeId: item.assignmentTypeId,
              note: item.note,
              customStartTime: item.customStartTime,
              customEndTime: item.customEndTime,
            });
          }
        }

        onPaste(pasteItems, Array.from(targetCellsMap.values()));
        return;
      }

      // Delete / Backspace -> Batch delete unlocked shifts
      if (
        matchesCombo(e, shortcuts.delete) ||
        (shortcuts.delete === 'Delete' && e.key === 'Backspace')
      ) {
        e.preventDefault();
        onBatchDelete(cells);
        return;
      }

      // Edit focused cell
      if (matchesCombo(e, shortcuts.editCell) || e.key === 'Enter') {
        e.preventDefault();
        const f = focus ?? anchor;
        if (!f) return;
        const p = people[f.row];
        const d = days[f.col];
        if (!p || !d) return;
        const cellEl = document.querySelector(
          `[data-cell-key="${p.id}::${d}"]`
        ) as HTMLElement | null;
        openCellEditorForPerson(p.id, d, cellEl?.getBoundingClientRect());
        return;
      }

      // Toggle Lock on selected shifts
      if (matchesCombo(e, shortcuts.lock)) {
        e.preventDefault();
        const selectedShifts: Shift[] = [];
        for (const c of cells) {
          selectedShifts.push(...(shiftsByCell.get(`${c.personId}::${c.date}`) ?? []));
        }
        if (selectedShifts.length === 0) return;
        const allLocked = selectedShifts.every((s) => s.isLocked);
        onBatchLock(!allLocked, cells);
        return;
      }

      // Open Note Editor on focused shift
      if (matchesCombo(e, shortcuts.note)) {
        e.preventDefault();
        const f = focus ?? anchor;
        if (!f) return;
        const p = people[f.row];
        const d = days[f.col];
        if (!p || !d) return;
        const cellShifts = shiftsByCell.get(`${p.id}::${d}`) ?? [];
        if (cellShifts.length > 0) {
          const cellEl = document.querySelector(
            `[data-cell-key="${p.id}::${d}"]`
          ) as HTMLElement | null;
          openNoteEditorForShift(cellShifts[0], cellEl?.getBoundingClientRect());
        }
        return;
      }

      if (isMod) return;

      // Shortcut keys (1-9, etc.) for AssignmentTypes
      const matchedAt = assignmentTypes.find(
        (at) => at.shortcutKey && at.shortcutKey.toLowerCase() === e.key.toLowerCase()
      );
      if (matchedAt) {
        e.preventDefault();
        onBatchAssign(matchedAt.id, cells);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    canEdit,
    gridDisplayMode,
    shortcuts,
    noteEditor,
    cellEditor,
    clipboard,
    people,
    days,
    anchor,
    focus,
    selectionBounds,
    getSelectedCellRefs,
    shiftsByCell,
    assignmentTypes,
    onChangeSelection,
    onBatchAssign,
    onBatchDelete,
    onBatchLock,
    onPaste,
    onUndo,
    openNoteEditorForShift,
    openCellEditorForPerson,
  ]);

  const handleSaveNote = async () => {
    if (!noteEditor) return;
    setSavingNote(true);
    try {
      await onUpdateShiftNote(noteEditor.shift.id, noteEditor.value.trim() || null);
      setNoteEditor(null);
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="print-grid-wrapper relative flex-1 overflow-auto bg-white">
      {/* Collapsible Conflicts Summary Drawer (Admin Only) */}
      {isAdmin && violations.length > 0 && (
        <div className="no-print border-b border-amber-200 bg-amber-50/90 px-3 py-1.5 text-xs">
          <button
            type="button"
            onClick={() => setConflictsOpen((o) => !o)}
            className="flex w-full items-center justify-between font-semibold text-amber-900"
          >
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              <span>
                {violations.length} Schedule {violations.length === 1 ? 'Conflict' : 'Conflicts'} Detected
              </span>
            </div>
            {conflictsOpen ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          {conflictsOpen && (
            <div className="mt-2 max-h-36 space-y-1 overflow-y-auto border-t border-amber-200/70 pt-1.5">
              {violations.map((v, i) => (
                <div
                  key={`${v.shiftId ?? 'quota'}-${v.personId}-${v.date}-${v.ruleId}-${i}`}
                  className="flex items-center justify-between gap-2 rounded bg-white/80 px-2 py-1 text-[11px] text-slate-800"
                >
                  <div>
                    <span className="font-semibold">{v.personName}</span> •{' '}
                    <span className="tabular-nums">
                      {v.shiftId ? v.date : `Week of ${v.date}`}
                    </span>{' '}
                    [{v.assignmentShortCode}]:{' '}
                    <span className="text-red-700">{v.message}</span>
                  </div>
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                    {v.ruleName}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <table className="w-full border-collapse text-left text-xs">
        <thead className="sticky top-0 z-20 bg-slate-50 shadow-[0_1px_0_0_#e2e8f0]">
          <tr>
            <th className="sticky left-0 z-30 min-w-[205px] max-w-[230px] border-b border-r border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-700">
              <div className="flex items-center justify-between">
                <span>
                  {gridDisplayMode === 'assignment'
                    ? `Assignments (${assignmentTypes.length})`
                    : `Team (${people.length})`}
                </span>
                {isAdmin && (
                  <span className="text-[10px] font-medium text-slate-400">
                    {gridDisplayMode === 'assignment' ? 'Target/Day' : 'Shifts / Hrs'}
                  </span>
                )}
              </div>
            </th>
            {days.map((date) => {
              const { dow, monthDay, isWeekend } = formatDayHeader(date);
              const cov = dayCoverage.get(date);
              const covMet = cov ? cov.filled >= cov.required : true;
              return (
                <th
                  key={date}
                  className={`min-w-[116px] border-b border-r border-slate-200 px-2 py-1.5 text-center font-medium ${
                    isWeekend ? 'bg-slate-100/80 text-slate-600' : 'bg-slate-50 text-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wide">
                      {dow}
                    </span>
                    <span className="text-[11px] text-slate-500 tabular-nums">{monthDay}</span>
                  </div>
                  {isAdmin && cov && (
                    <div className="mt-1 flex justify-end">
                      <span
                        className={`rounded px-1.5 py-0.2 text-[10px] font-semibold tabular-nums ${
                          covMet
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                        title={`Filled ${cov.filled} of ${cov.required} target shifts`}
                      >
                        {cov.filled}/{cov.required}
                      </span>
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {gridDisplayMode === 'assignment'
            ? assignmentTypes.map((at) => {
                const catName = categoryMap.get(at.categoryId)?.name ?? '';
                const fg = getContrastTextColor(at.colorHex);
                return (
                  <tr key={at.id} className="group hover:bg-slate-50/40">
                    {/* Sticky Assignment Column */}
                    <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-1.5 group-hover:bg-slate-50/90">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              style={{ backgroundColor: at.colorHex, color: fg }}
                              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold"
                            >
                              {at.shortCode}
                            </span>
                            <span className="truncate font-semibold text-slate-900 max-w-[125px]">
                              {at.name}
                            </span>
                          </div>
                          <div className="mt-0.5 truncate text-[10px] text-slate-500 max-w-[170px]">
                            {catName ? `${catName} • ` : ''}
                            {at.startTime}–{at.endTime}
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="shrink-0 text-right text-[10px] font-medium text-slate-500 tabular-nums">
                            <div>{at.requiredStaffPerDay ?? 1}/d</div>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Day Cells (Assignment x Day) */}
                    {days.map((date) => {
                      const key = `${at.id}::${date}`;
                      const cellShifts = shiftsByAssignmentCell.get(key) ?? [];
                      const { isWeekend, dayOfWeek } = formatDayHeader(date);
                      const isAllowedDay = at.allowedDaysOfWeek.includes(dayOfWeek);
                      const req = isAllowedDay ? (at.requiredStaffPerDay ?? 1) : 0;
                      const isUnderstaffed = isAdmin && req > 0 && cellShifts.length < req;

                      return (
                        <td
                          key={key}
                          data-assignment-cell-key={key}
                          onClick={(e) => {
                            if (!canEdit) return;
                            openCellEditorForAssignment(
                              at.id,
                              date,
                              (e.currentTarget as HTMLElement).getBoundingClientRect()
                            );
                          }}
                          className={`relative h-14 min-w-[116px] select-none border-b border-r border-slate-200 p-1 align-top transition-colors ${
                            !isAllowedDay
                              ? 'bg-slate-100/60'
                              : isWeekend
                                ? 'bg-slate-50/50'
                                : 'bg-white'
                          } ${canEdit ? 'cursor-pointer hover:bg-blue-50/30' : ''}`}
                        >
                          <div className="flex flex-col gap-1">
                            {cellShifts.map((shift) => {
                              const person = personMap.get(shift.personId);
                              const initials = initialsMap.get(shift.personId) ?? '?';
                              const hasNote = Boolean(shift.note && shift.note.trim());
                              const shiftViolations = isAdmin
                                ? violationsByShiftId.get(shift.id) ?? []
                                : [];
                              const hasConflict = shiftViolations.length > 0;

                              return (
                                <div
                                  key={shift.id}
                                  onDoubleClick={(e) => {
                                    if (!canEdit) return;
                                    e.stopPropagation();
                                    openNoteEditorForShift(
                                      shift,
                                      (e.currentTarget as HTMLElement).getBoundingClientRect()
                                    );
                                  }}
                                  title={`${at.name}: ${person?.name ?? 'Unknown'} (${
                                    person?.role ?? ''
                                  }) • ${shift.customStartTime || at.startTime}–${
                                    shift.customEndTime || at.endTime
                                  }${shift.isLocked ? ' • Locked' : ''}${
                                    hasNote ? `\nNote: ${shift.note}` : ''
                                  }${
                                    hasConflict
                                      ? `\n⚠ Conflicts:\n${shiftViolations
                                          .map((v) => `• ${v.ruleName}: ${v.message}`)
                                          .join('\n')}`
                                      : ''
                                  }`}
                                  style={{ backgroundColor: at.colorHex, color: fg }}
                                  className={`relative flex items-center justify-between gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold shadow-2xs ${
                                    hasConflict ? 'ring-2 ring-red-500 ring-offset-1' : ''
                                  }`}
                                >
                                  <span className="truncate">
                                    {at.shortCode} ({initials})
                                  </span>
                                  <div className="flex shrink-0 items-center gap-0.5">
                                    {hasConflict && (
                                      <AlertTriangle
                                        className="no-print h-3 w-3 text-amber-300 drop-shadow-xs"
                                        aria-label="Conflict"
                                      />
                                    )}
                                    {shift.isLocked && (
                                      <Lock
                                        className="no-print h-2.5 w-2.5 opacity-90"
                                        aria-label="Locked"
                                      />
                                    )}
                                    {hasNote && (
                                      <span
                                        className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300 ring-1 ring-black/20"
                                        aria-label="Has note"
                                      />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            {isUnderstaffed && (
                              <div className="text-[10px] font-medium text-amber-700/80">
                                Need {req - cellShifts.length}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            : people.map((person, rowIdx) => {
            const stats = personStats.get(person.id) ?? { count: 0, hours: 0 };
            const personQuotas = isAdmin ? quotaViolationsByPersonId.get(person.id) ?? [] : [];
            return (
              <tr key={person.id} className="group hover:bg-slate-50/40">
                {/* Sticky Person Column */}
                <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-1.5 group-hover:bg-slate-50/90">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => isAdmin && onOpenPersonDrawer(person)}
                      className={`text-left ${isAdmin ? 'hover:text-blue-600 cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="truncate font-semibold text-slate-900 max-w-[125px]">
                          {person.name}
                        </span>
                        {personQuotas.length > 0 && (
                          <span
                            title={personQuotas.map((q) => q.message).join('\n')}
                            className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-800"
                          >
                            <AlertTriangle className="h-2.5 w-2.5" />
                            {personQuotas.length}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[10px] text-slate-500 max-w-[135px]">
                        {person.role}
                      </div>
                    </button>
                    {isAdmin && (
                      <div className="shrink-0 text-right text-[10px] font-medium text-slate-500 tabular-nums">
                        <div>{stats.count}s</div>
                        <div className="text-slate-400">{stats.hours}h</div>
                      </div>
                    )}
                  </div>
                </td>

                {/* Day Cells */}
                {days.map((date, colIdx) => {
                  const key = `${person.id}::${date}`;
                  const cellShifts = shiftsByCell.get(key) ?? [];
                  const { isWeekend } = formatDayHeader(date);

                  const isSelected =
                    selectionBounds !== null &&
                    rowIdx >= selectionBounds.minRow &&
                    rowIdx <= selectionBounds.maxRow &&
                    colIdx >= selectionBounds.minCol &&
                    colIdx <= selectionBounds.maxCol;

                  const isFocus = focus?.row === rowIdx && focus?.col === colIdx;
                  const isCopied = clipboard?.sourceKeys.has(key) ?? false;

                  // Selection border edges for unified outline
                  const selTop = isSelected && rowIdx === selectionBounds!.minRow;
                  const selBottom = isSelected && rowIdx === selectionBounds!.maxRow;
                  const selLeft = isSelected && colIdx === selectionBounds!.minCol;
                  const selRight = isSelected && colIdx === selectionBounds!.maxCol;

                  return (
                    <td
                      key={key}
                      data-cell-key={key}
                      onMouseDown={(e) => {
                        if (!canEdit || e.button !== 0) return;
                        dragStartCellRef.current = { row: rowIdx, col: colIdx };
                        didMarqueeMoveRef.current = false;
                        if (e.shiftKey && anchor) {
                          onChangeSelection(anchor, { row: rowIdx, col: colIdx });
                        } else {
                          onChangeSelection({ row: rowIdx, col: colIdx }, { row: rowIdx, col: colIdx });
                          setIsDraggingMarquee(true);
                        }
                      }}
                      onMouseEnter={() => {
                        if (canEdit && isDraggingMarquee && anchor) {
                          if (
                            dragStartCellRef.current &&
                            (dragStartCellRef.current.row !== rowIdx ||
                              dragStartCellRef.current.col !== colIdx)
                          ) {
                            didMarqueeMoveRef.current = true;
                          }
                          onChangeSelection(anchor, { row: rowIdx, col: colIdx });
                        }
                      }}
                      onMouseUp={(e) => {
                        if (!canEdit || e.button !== 0 || e.shiftKey) return;
                        if (
                          !didMarqueeMoveRef.current &&
                          dragStartCellRef.current?.row === rowIdx &&
                          dragStartCellRef.current?.col === colIdx
                        ) {
                          openCellEditorForPerson(
                            person.id,
                            date,
                            (e.currentTarget as HTMLElement).getBoundingClientRect()
                          );
                        }
                      }}
                      onDragOver={(e) => {
                        if (!canEdit) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                      }}
                      onDrop={(e) => {
                        if (!canEdit) return;
                        e.preventDefault();
                        const assignmentTypeId = e.dataTransfer.getData('application/x-assignment-type-id');
                        const moveShiftId = e.dataTransfer.getData('application/x-move-shift-id');
                        if (assignmentTypeId) {
                          onBatchAssign(assignmentTypeId, [{ personId: person.id, date }]);
                        } else if (moveShiftId) {
                          onMoveShift(moveShiftId, person.id, date);
                        }
                      }}
                      className={`relative h-14 min-w-[116px] select-none border-b border-r border-slate-200 p-1 align-top transition-colors ${
                        isWeekend ? 'bg-slate-50/50' : 'bg-white'
                      } ${isSelected ? 'bg-blue-50/60' : ''} ${
                        isCopied ? 'marching-ants' : ''
                      }`}
                      style={{
                        boxShadow: isSelected
                          ? [
                              selTop ? 'inset 0 2px 0 0 #2563eb' : '',
                              selBottom ? 'inset 0 -2px 0 0 #2563eb' : '',
                              selLeft ? 'inset 2px 0 0 0 #2563eb' : '',
                              selRight ? 'inset -2px 0 0 0 #2563eb' : '',
                            ]
                              .filter(Boolean)
                              .join(', ') || undefined
                          : undefined,
                        outline: isFocus ? '2px solid #1d4ed8' : undefined,
                        outlineOffset: isFocus ? '-2px' : undefined,
                      }}
                    >
                      <div className="flex flex-col gap-1">
                        {cellShifts.map((shift) => {
                          const at = assignmentMap.get(shift.assignmentTypeId);
                          if (!at) return null;
                          const fg = getContrastTextColor(at.colorHex);
                          const hasNote = Boolean(shift.note && shift.note.trim());
                          const shiftViolations = isAdmin ? violationsByShiftId.get(shift.id) ?? [] : [];
                          const hasConflict = shiftViolations.length > 0;

                          return (
                            <div
                              key={shift.id}
                              draggable={canEdit && !shift.isLocked}
                              onDragStart={(e) => {
                                if (!canEdit || shift.isLocked) {
                                  e.preventDefault();
                                  return;
                                }
                                e.dataTransfer.setData('application/x-move-shift-id', shift.id);
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              onDoubleClick={(e) => {
                                if (!canEdit) return;
                                e.stopPropagation();
                                openNoteEditorForShift(
                                  shift,
                                  (e.currentTarget as HTMLElement).getBoundingClientRect()
                                );
                              }}
                              title={`${at.name} (${shift.customStartTime || at.startTime}–${
                                shift.customEndTime || at.endTime
                              })${shift.isLocked ? ' • Locked' : ''}${
                                hasNote ? `\nNote: ${shift.note}` : ''
                              }${
                                hasConflict
                                  ? `\n⚠ Conflicts:\n${shiftViolations
                                      .map((v) => `• ${v.ruleName}: ${v.message}`)
                                      .join('\n')}`
                                  : ''
                              }`}
                              style={{ backgroundColor: at.colorHex, color: fg }}
                              className={`relative flex items-center justify-between gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold shadow-2xs ${
                                hasConflict ? 'ring-2 ring-red-500 ring-offset-1' : ''
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-1">
                                <span className="truncate">{at.shortCode}</span>
                                <span className="truncate text-[9px] font-medium opacity-80">
                                  {at.timeBlockLabel}
                                </span>
                              </div>
                              <div className="flex shrink-0 items-center gap-0.5">
                                {hasConflict && (
                                  <AlertTriangle
                                    className="no-print h-3 w-3 text-amber-300 drop-shadow-xs"
                                    aria-label="Conflict"
                                  />
                                )}
                                {shift.isLocked && (
                                  <Lock className="no-print h-2.5 w-2.5 opacity-90" aria-label="Locked" />
                                )}
                                {hasNote && (
                                  <span
                                    className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300 ring-1 ring-black/20"
                                    aria-label="Has note"
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Floating Selection Pill */}
      {canEdit && selectionBounds && (
        <div
          data-testid="selection-pill"
          className="no-print fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3.5 py-1.5 text-xs text-white shadow-lg"
        >
          <span className="font-semibold tabular-nums">
            {selectionBounds.rowCount} {selectionBounds.rowCount === 1 ? 'person' : 'people'} ×{' '}
            {selectionBounds.colCount} {selectionBounds.colCount === 1 ? 'day' : 'days'} selected
          </span>
          <div className="h-3.5 w-px bg-slate-700" />
          <button
            type="button"
            onClick={() => onBatchLock(true, getSelectedCellRefs())}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-800"
            title="Lock shifts (L)"
          >
            <Lock className="h-3 w-3" />
            <span>Lock</span>
          </button>
          <button
            type="button"
            onClick={() => onBatchLock(false, getSelectedCellRefs())}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-800"
            title="Unlock shifts (L)"
          >
            <Unlock className="h-3 w-3" />
            <span>Unlock</span>
          </button>
          <button
            type="button"
            onClick={() => onBatchDelete(getSelectedCellRefs())}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-red-300 hover:bg-slate-800 hover:text-red-200"
            title="Delete unlocked shifts (Del)"
          >
            <Trash2 className="h-3 w-3" />
            <span>Delete</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeSelection(null, null)}
            className="rounded-full p-0.5 text-slate-400 hover:bg-slate-800 hover:text-white"
            title="Clear selection (Esc)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Inline Shift Note Popover */}
      {noteEditor && (
        <div
          data-modal-open="true"
          style={{ left: noteEditor.x, top: noteEditor.y }}
          className="fixed z-50 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
        >
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <MessageSquare className="h-3.5 w-3.5 text-blue-600" />
              <span>Shift Note</span>
            </div>
            <button
              type="button"
              onClick={() => setNoteEditor(null)}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <textarea
            ref={noteInputRef}
            value={noteEditor.value}
            onChange={(e) => setNoteEditor({ ...noteEditor, value: e.target.value.slice(0, 160) })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSaveNote();
              }
            }}
            rows={2}
            placeholder="Add shift note (max 160 chars)..."
            className="w-full rounded-md border border-slate-200 p-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 tabular-nums">
              {noteEditor.value.length}/160
            </span>
            <div className="flex items-center gap-1.5">
              {noteEditor.shift.note && (
                <button
                  type="button"
                  disabled={savingNote}
                  onClick={async () => {
                    setSavingNote(true);
                    try {
                      await onUpdateShiftNote(noteEditor.shift.id, null);
                      setNoteEditor(null);
                    } finally {
                      setSavingNote(false);
                    }
                  }}
                  className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                disabled={savingNote}
                onClick={handleSaveNote}
                className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Click-to-Edit Day Cell Popover */}
      {canEdit && cellEditor && (
        <div
          className="no-print fixed inset-0 z-40"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setCellEditor(null);
          }}
        >
          <div
            style={{ left: cellEditor.x, top: cellEditor.y }}
            className="fixed z-40 w-80 max-h-[82vh] flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl"
          >
            {cellEditor.mode === 'person' ? (
              (() => {
                const person = personMap.get(cellEditor.personId);
                const cellKey = `${cellEditor.personId}::${cellEditor.date}`;
                const cellShifts = shiftsByCell.get(cellKey) ?? [];
                if (!person) return null;

                return (
                  <>
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-slate-900">
                          {person.name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {formatLongDate(cellEditor.date)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCellEditor(null)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="space-y-3 overflow-y-auto p-3 text-xs">
                      {/* Existing Shifts in Cell */}
                      {cellShifts.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Assigned Shifts
                          </div>
                          {cellShifts.map((shift) => {
                            const at = assignmentMap.get(shift.assignmentTypeId);
                            if (!at) return null;
                            const fg = getContrastTextColor(at.colorHex);
                            return (
                              <div
                                key={shift.id}
                                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-1.5"
                              >
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <span
                                    style={{ backgroundColor: at.colorHex, color: fg }}
                                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold"
                                  >
                                    {at.shortCode}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="truncate font-medium text-slate-800">
                                      {at.name}
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      {shift.customStartTime || at.startTime}–
                                      {shift.customEndTime || at.endTime}
                                      {shift.note ? ` • "${shift.note}"` : ''}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => onToggleShiftLock(shift)}
                                    title={shift.isLocked ? 'Unlock shift' : 'Lock shift'}
                                    className={`rounded p-1 hover:bg-white ${
                                      shift.isLocked ? 'text-amber-600' : 'text-slate-400 hover:text-slate-700'
                                    }`}
                                  >
                                    {shift.isLocked ? (
                                      <Lock className="h-3.5 w-3.5" />
                                    ) : (
                                      <Unlock className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) =>
                                      openNoteEditorForShift(
                                        shift,
                                        (e.currentTarget as HTMLElement).getBoundingClientRect()
                                      )
                                    }
                                    title="Edit shift note"
                                    className={`rounded p-1 hover:bg-white ${
                                      shift.note ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
                                    }`}
                                  >
                                    <MessageSquare className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={shift.isLocked}
                                    onClick={() => onDeleteShift(shift.id)}
                                    title={shift.isLocked ? 'Unlock before deleting' : 'Remove shift'}
                                    className="rounded p-1 text-red-500 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Quick Assign Buttons */}
                      <div>
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Click to Assign Shift
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {assignmentTypes.map((at) => {
                            const fg = getContrastTextColor(at.colorHex);
                            return (
                              <button
                                key={at.id}
                                type="button"
                                onClick={() =>
                                  onBatchAssign(at.id, [
                                    { personId: cellEditor.personId, date: cellEditor.date },
                                  ])
                                }
                                style={{ backgroundColor: at.colorHex, color: fg }}
                                className="flex items-center justify-between gap-1 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold shadow-2xs transition-transform hover:scale-[1.02]"
                              >
                                <span className="flex min-w-0 items-center gap-1">
                                  <Plus className="h-3 w-3 shrink-0 opacity-80" />
                                  <span className="truncate">{at.shortCode}</span>
                                </span>
                                {at.shortcutKey && (
                                  <kbd className="rounded bg-black/15 px-1 font-mono text-[9px]">
                                    {at.shortcutKey}
                                  </kbd>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()
            ) : (
              (() => {
                const at = assignmentMap.get(cellEditor.assignmentTypeId);
                const cellKey = `${cellEditor.assignmentTypeId}::${cellEditor.date}`;
                const cellShifts = shiftsByAssignmentCell.get(cellKey) ?? [];
                if (!at) return null;
                const fg = getContrastTextColor(at.colorHex);
                const assignedPersonIds = new Set(cellShifts.map((s) => s.personId));

                return (
                  <>
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            style={{ backgroundColor: at.colorHex, color: fg }}
                            className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                          >
                            {at.shortCode}
                          </span>
                          <span className="truncate text-xs font-semibold text-slate-900">
                            {at.name}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {formatLongDate(cellEditor.date)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCellEditor(null)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="space-y-3 overflow-y-auto p-3 text-xs">
                      {cellShifts.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Assigned Personnel
                          </div>
                          {cellShifts.map((shift) => {
                            const person = personMap.get(shift.personId);
                            const initials = initialsMap.get(shift.personId) ?? '?';
                            return (
                              <div
                                key={shift.id}
                                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-1.5"
                              >
                                <div className="min-w-0">
                                  <div className="truncate font-medium text-slate-800">
                                    {person?.name ?? 'Unknown'}{' '}
                                    <span className="text-slate-500">({initials})</span>
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    {person?.role}
                                    {shift.note ? ` • "${shift.note}"` : ''}
                                  </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => onToggleShiftLock(shift)}
                                    title={shift.isLocked ? 'Unlock shift' : 'Lock shift'}
                                    className={`rounded p-1 hover:bg-white ${
                                      shift.isLocked ? 'text-amber-600' : 'text-slate-400 hover:text-slate-700'
                                    }`}
                                  >
                                    {shift.isLocked ? (
                                      <Lock className="h-3.5 w-3.5" />
                                    ) : (
                                      <Unlock className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) =>
                                      openNoteEditorForShift(
                                        shift,
                                        (e.currentTarget as HTMLElement).getBoundingClientRect()
                                      )
                                    }
                                    title="Edit shift note"
                                    className={`rounded p-1 hover:bg-white ${
                                      shift.note ? 'text-blue-600' : 'text-slate-400 hover:text-slate-700'
                                    }`}
                                  >
                                    <MessageSquare className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={shift.isLocked}
                                    onClick={() => onDeleteShift(shift.id)}
                                    title={shift.isLocked ? 'Unlock before deleting' : 'Remove shift'}
                                    className="rounded p-1 text-red-500 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div>
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Click Person to Assign
                        </div>
                        <div className="max-h-48 space-y-1 overflow-y-auto pr-0.5">
                          {people.map((p) => {
                            const already = assignedPersonIds.has(p.id);
                            const initials = initialsMap.get(p.id) ?? '?';
                            return (
                              <button
                                key={p.id}
                                type="button"
                                disabled={already}
                                onClick={() =>
                                  onBatchAssign(at.id, [{ personId: p.id, date: cellEditor.date }])
                                }
                                className={`flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left transition-colors ${
                                  already
                                    ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-default'
                                    : 'border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50/50'
                                }`}
                              >
                                <div className="min-w-0">
                                  <span className="font-semibold">{p.name}</span>{' '}
                                  <span className="text-[10px] text-slate-500">({initials})</span>
                                  <div className="truncate text-[10px] text-slate-400">{p.role}</div>
                                </div>
                                {already ? (
                                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                    Assigned
                                  </span>
                                ) : (
                                  <Plus className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                );
              })()
            )}
          </div>
        </div>
      )}
    </div>
  );
};
