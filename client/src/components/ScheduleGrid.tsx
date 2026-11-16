import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Lock,
  MessageSquare,
  Slash,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import type {
  AssignmentType,
  CellCoord,
  ClipboardItem,
  ClipboardState,
  ConstraintViolation,
  Person,
  Shift,
  Unavailability,
} from '../types';
import {
  compareShiftsByTime,
  formatDayHeader,
  getContrastTextColor,
  getShiftHours,
} from '../utils';

interface ScheduleGridProps {
  days: string[];
  people: Person[];
  assignmentTypes: AssignmentType[];
  shifts: Shift[];
  unavailabilities: Unavailability[];
  violations?: ConstraintViolation[];
  isAdmin: boolean;
  canEdit: boolean; // true only when isAdmin && adminViewMode === 'DRAFT'
  selectedCells: CellCoord[];
  anchor: CellCoord | null;
  focus: CellCoord | null;
  onChangeSelection: (anchor: CellCoord | null, focus: CellCoord | null) => void;
  onBatchAssign: (assignmentTypeId: string, cells: Array<{ personId: string; date: string }>) => void;
  onBatchDelete: (cells: Array<{ personId: string; date: string }>) => void;
  onBatchLock: (isLocked: boolean, cells: Array<{ personId: string; date: string }>) => void;
  onTogglePto: (cells: Array<{ personId: string; date: string }>) => void;
  onUpdateShiftNote: (shiftId: string, note: string | null) => Promise<void>;
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
  assignmentTypes,
  shifts,
  unavailabilities,
  violations = [],
  isAdmin,
  canEdit,
  anchor,
  focus,
  onChangeSelection,
  onBatchAssign,
  onBatchDelete,
  onBatchLock,
  onTogglePto,
  onUpdateShiftNote,
  onMoveShift,
  onPaste,
  onUndo,
  onOpenPersonDrawer,
  onOpenShortcuts,
}) => {
  const [isDraggingMarquee, setIsDraggingMarquee] = useState(false);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [noteEditor, setNoteEditor] = useState<{
    shift: Shift;
    value: string;
    x: number;
    y: number;
  } | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null);

  const violationsByShiftId = useMemo(() => {
    const map = new Map<string, ConstraintViolation[]>();
    for (const v of violations) {
      const arr = map.get(v.shiftId) ?? [];
      arr.push(v);
      map.set(v.shiftId, arr);
    }
    return map;
  }, [violations]);

  const assignmentMap = useMemo(
    () => new Map(assignmentTypes.map((a) => [a.id, a])),
    [assignmentTypes]
  );

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

  const unavailByCell = useMemo(() => {
    const map = new Map<string, Unavailability>();
    for (const u of unavailabilities) {
      map.set(`${u.personId}::${u.date}`, u);
    }
    return map;
  }, [unavailabilities]);

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

      if (e.key === '?') {
        e.preventDefault();
        onOpenShortcuts();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (noteEditor) {
          setNoteEditor(null);
        } else if (clipboard) {
          setClipboard(null);
        } else {
          onChangeSelection(null, null);
        }
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;

      // Ctrl/Cmd + Z -> Undo
      if (isMod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onUndo();
        return;
      }

      // Ctrl/Cmd + A -> Select all visible cells
      if (isMod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (people.length > 0 && days.length > 0) {
          onChangeSelection({ row: 0, col: 0 }, { row: people.length - 1, col: days.length - 1 });
        }
        return;
      }

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

      // Operations requiring a selection
      if (!selectionBounds) return;
      const cells = getSelectedCellRefs();
      if (cells.length === 0) return;

      // Ctrl/Cmd + C -> Copy
      if (isMod && e.key.toLowerCase() === 'c') {
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

      // Ctrl/Cmd + X -> Cut
      if (isMod && e.key.toLowerCase() === 'x') {
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

      // Ctrl/Cmd + V -> Paste
      if (isMod && e.key.toLowerCase() === 'v') {
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

      if (isMod) return;

      // Delete / Backspace -> Batch delete unlocked shifts
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onBatchDelete(cells);
        return;
      }

      // L -> Toggle Lock on selected shifts
      if (e.key.toLowerCase() === 'l') {
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

      // U -> Toggle PTO/Unavailability
      if (e.key.toLowerCase() === 'u') {
        e.preventDefault();
        onTogglePto(cells);
        return;
      }

      // N -> Open Note Editor on focused shift
      if (e.key.toLowerCase() === 'n') {
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
    noteEditor,
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
    onTogglePto,
    onPaste,
    onUndo,
    onOpenShortcuts,
    openNoteEditorForShift,
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
                  key={`${v.shiftId}-${v.ruleId}-${i}`}
                  className="flex items-center justify-between gap-2 rounded bg-white/80 px-2 py-1 text-[11px] text-slate-800"
                >
                  <div>
                    <span className="font-semibold">{v.personName}</span> •{' '}
                    <span className="tabular-nums">{v.date}</span> [{v.assignmentShortCode}]:{' '}
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
                <span>Team ({people.length})</span>
                {isAdmin && <span className="text-[10px] font-medium text-slate-400">Shifts / Hrs</span>}
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
          {people.map((person, rowIdx) => {
            const stats = personStats.get(person.id) ?? { count: 0, hours: 0 };
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
                      <div className="truncate font-semibold text-slate-900 max-w-[135px]">
                        {person.name}
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
                  const unavail = unavailByCell.get(key);
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
                        if (e.shiftKey && anchor) {
                          onChangeSelection(anchor, { row: rowIdx, col: colIdx });
                        } else {
                          onChangeSelection({ row: rowIdx, col: colIdx }, { row: rowIdx, col: colIdx });
                          setIsDraggingMarquee(true);
                        }
                      }}
                      onMouseEnter={() => {
                        if (canEdit && isDraggingMarquee && anchor) {
                          onChangeSelection(anchor, { row: rowIdx, col: colIdx });
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
                        unavail
                          ? 'pto-hatched'
                          : isWeekend
                            ? 'bg-slate-50/50'
                            : 'bg-white'
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
                      {unavail && (
                        <div
                          className="mb-1 flex items-center gap-1 rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                          title={isAdmin && unavail.note ? `PTO: ${unavail.note}` : 'Unavailable'}
                        >
                          <Slash className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">
                            {unavail.timeBlock === 'FULL_DAY'
                              ? 'Unavailable'
                              : `PTO (${unavail.timeBlock})`}
                          </span>
                        </div>
                      )}

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
            onClick={() => onTogglePto(getSelectedCellRefs())}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-800"
            title="Toggle PTO / Unavailable (U)"
          >
            <Slash className="h-3 w-3" />
            <span>PTO</span>
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
    </div>
  );
};
