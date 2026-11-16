import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { FilterBar } from './components/FilterBar';
import {
  AutoSchedulerModal,
  RotationTemplatesModal,
  RulesEngineModal,
  StatsModal,
  SyncCalendarModal,
} from './components/Milestone2Modals';
import {
  CategoriesAssignmentsModal,
  LoginModal,
  PersonDrawer,
  RosterModal,
  SettingsModal,
  ShortcutsModal,
} from './components/Modals';
import { MyAgendaView } from './components/MyAgendaView';
import { ScheduleGrid } from './components/ScheduleGrid';
import { TopBar } from './components/TopBar';
import type {
  CellCoord,
  Person,
  PublishStatus,
  RangeMode,
  ScheduleData,
  SortMode,
  UndoEntry,
  ViewMode,
} from './types';
import {
  addDays,
  formatDayHeader,
  getContrastTextColor,
  getDaysArray,
  getMondayOfWeek,
  getShiftHours,
} from './utils';

export function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [adminViewMode, setAdminViewMode] = useState<PublishStatus>('DRAFT');

  const [rangeMode, setRangeMode] = useState<RangeMode>('week');
  const [startDate, setStartDate] = useState<Date>(() => getMondayOfWeek(new Date()));

  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'agenda' : 'grid'
  );
  const prevWidthRef = useRef<number>(typeof window !== 'undefined' ? window.innerWidth : 1024);

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      if (prevWidthRef.current >= 768 && w < 768) {
        setViewMode('agenda');
      } else if (prevWidthRef.current < 768 && w >= 768) {
        setViewMode('grid');
      }
      prevWidthRef.current = w;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const dayCount = rangeMode === 'week' ? 7 : rangeMode === 'biweek' ? 14 : 28;
  const days = useMemo(() => getDaysArray(startDate, dayCount), [startDate, dayCount]);
  const startYMD = days[0];
  const endYMD = days[days.length - 1];

  const dateRangeLabel = useMemo(() => {
    const s = formatDayHeader(startYMD);
    const e = formatDayHeader(endYMD);
    return `${s.monthDay} – ${e.monthDay}`;
  }, [startYMD, endYMD]);

  const [data, setData] = useState<ScheduleData>({
    people: [],
    categories: [],
    assignmentTypes: [],
    shifts: [],
    unavailabilities: [],
    unpublishedChangesCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('order');

  // Grid Selection & Undo
  const [anchor, setAnchor] = useState<CellCoord | null>(null);
  const [focus, setFocus] = useState<CellCoord | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);

  // Modals / Drawers
  const [showLogin, setShowLogin] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAutoScheduler, setShowAutoScheduler] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSyncCalendar, setShowSyncCalendar] = useState(false);
  const [activePersonDrawer, setActivePersonDrawer] = useState<Person | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'info' | 'error' } | null>(null);
  const showToast = useCallback((msg: string, type: 'info' | 'error' = 'info') => {
    setToast({ msg, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Check initial auth
  useEffect(() => {
    api
      .getMe()
      .then((res) => setIsAdmin(res.isAdmin))
      .catch(() => setIsAdmin(false))
      .finally(() => setAuthChecked(true));
  }, []);

  const fetchSchedule = useCallback(async () => {
    if (!authChecked) return;
    try {
      const result = isAdmin
        ? await api.getAdminSchedule(startYMD, endYMD, adminViewMode)
        : await api.getPublicSchedule(startYMD, endYMD);
      setData(result);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load schedule', 'error');
    } finally {
      setLoading(false);
    }
  }, [authChecked, isAdmin, startYMD, endYMD, adminViewMode, showToast]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  const canEdit = isAdmin && adminViewMode === 'DRAFT';

  // Filtered AssignmentTypes & Shifts
  const assignmentMap = useMemo(
    () => new Map(data.assignmentTypes.map((a) => [a.id, a])),
    [data.assignmentTypes]
  );

  const visibleShifts = useMemo(() => {
    return data.shifts.filter((s) => {
      if (selectedAssignmentId && s.assignmentTypeId !== selectedAssignmentId) return false;
      if (selectedCategoryId) {
        const at = assignmentMap.get(s.assignmentTypeId);
        if (!at || at.categoryId !== selectedCategoryId) return false;
      }
      return true;
    });
  }, [data.shifts, selectedAssignmentId, selectedCategoryId, assignmentMap]);

  const visiblePeople = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = data.people.filter((p) => {
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q);
    });

    if (sortMode === 'order') return filtered;

    const stats = new Map<string, { count: number; hours: number }>();
    for (const s of visibleShifts) {
      const prev = stats.get(s.personId) ?? { count: 0, hours: 0 };
      prev.count += 1;
      prev.hours += getShiftHours(s, assignmentMap);
      stats.set(s.personId, prev);
    }

    return [...filtered].sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      if (sortMode === 'role') return a.role.localeCompare(b.role) || a.name.localeCompare(b.name);
      if (sortMode === 'shifts') {
        return (stats.get(b.id)?.count ?? 0) - (stats.get(a.id)?.count ?? 0);
      }
      if (sortMode === 'hours') {
        return (stats.get(b.id)?.hours ?? 0) - (stats.get(a.id)?.hours ?? 0);
      }
      return 0;
    });
  }, [data.people, searchQuery, sortMode, visibleShifts, assignmentMap]);

  // Actions
  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await api.publishChanges();
      showToast(`Published ${res.publishedShifts} shifts to live view.`);
      await fetchSchedule();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Publish failed', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const handleDiscard = async () => {
    if (!confirm('Discard all unpublished draft changes and revert to the last published schedule?')) {
      return;
    }
    setPublishing(true);
    try {
      await api.discardDrafts();
      setUndoStack([]);
      showToast('Discarded unpublished draft changes.');
      await fetchSchedule();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Discard failed', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const pushUndo = useCallback((entry: UndoEntry) => {
    setUndoStack((prev) => [...prev.slice(-24), entry]);
  }, []);

  const handleUndo = useCallback(async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) {
      showToast('Nothing to undo');
      return;
    }
    try {
      await api.batchRestore(last.deleteIds, last.restoreShifts);
      setUndoStack((prev) => prev.slice(0, -1));
      showToast(`Undid: ${last.description}`);
      await fetchSchedule();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Undo failed', 'error');
    }
  }, [undoStack, fetchSchedule, showToast]);

  const handleBatchAssign = useCallback(
    async (assignmentTypeId: string, cells: Array<{ personId: string; date: string }>) => {
      if (!canEdit || cells.length === 0) return;
      try {
        const res = await api.batchAssign(assignmentTypeId, cells, false);
        if (res.created.length > 0 || res.removed.length > 0) {
          pushUndo({
            description: 'Assign shifts',
            deleteIds: res.created.map((s) => s.id),
            restoreShifts: res.removed.map((s) => ({
              personId: s.personId,
              assignmentTypeId: s.assignmentTypeId,
              date: s.date,
              isLocked: s.isLocked,
              note: s.note,
              customStartTime: s.customStartTime,
              customEndTime: s.customEndTime,
              publishedPairId: s.publishedPairId ?? null,
            })),
          });
        }
        if (res.skippedLocked > 0 || res.skippedPto > 0) {
          showToast(
            `Assigned ${res.created.length} (skipped ${res.skippedLocked} locked, ${res.skippedPto} PTO)`
          );
        }
        await fetchSchedule();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Assign failed', 'error');
      }
    },
    [canEdit, pushUndo, fetchSchedule, showToast]
  );

  const handleBatchDelete = useCallback(
    async (cells: Array<{ personId: string; date: string }>) => {
      if (!canEdit || cells.length === 0) return;
      try {
        const res = await api.batchDelete(cells);
        if (res.deletedShifts.length > 0) {
          pushUndo({
            description: `Delete ${res.deletedShifts.length} shift(s)`,
            deleteIds: [],
            restoreShifts: res.deletedShifts.map((s) => ({
              personId: s.personId,
              assignmentTypeId: s.assignmentTypeId,
              date: s.date,
              isLocked: s.isLocked,
              note: s.note,
              customStartTime: s.customStartTime,
              customEndTime: s.customEndTime,
              publishedPairId: s.publishedPairId ?? null,
            })),
          });
        }
        if (res.skippedLockedCount > 0) {
          showToast(`Deleted ${res.deletedShifts.length}; skipped ${res.skippedLockedCount} locked.`);
        }
        await fetchSchedule();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
      }
    },
    [canEdit, pushUndo, fetchSchedule, showToast]
  );

  const handleBatchLock = useCallback(
    async (isLocked: boolean, cells: Array<{ personId: string; date: string }>) => {
      if (!canEdit || cells.length === 0) return;
      try {
        const res = await api.batchLock(isLocked, cells);
        showToast(`${isLocked ? 'Locked' : 'Unlocked'} ${res.updatedCount} shift(s).`);
        await fetchSchedule();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Lock failed', 'error');
      }
    },
    [canEdit, fetchSchedule, showToast]
  );

  const handleTogglePto = useCallback(
    async (cells: Array<{ personId: string; date: string }>) => {
      if (!canEdit || cells.length === 0) return;
      try {
        const res = await api.toggleUnavailability({ cells, timeBlock: 'FULL_DAY' });
        showToast(res.action === 'added' ? 'Marked PTO / Unavailable' : 'Cleared PTO / Unavailable');
        await fetchSchedule();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'PTO toggle failed', 'error');
      }
    },
    [canEdit, fetchSchedule, showToast]
  );

  const handleUpdateShiftNote = useCallback(
    async (shiftId: string, note: string | null) => {
      try {
        await api.updateShift(shiftId, { note });
        await fetchSchedule();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Note update failed', 'error');
      }
    },
    [fetchSchedule, showToast]
  );

  const handleMoveShift = useCallback(
    async (shiftId: string, targetPersonId: string, targetDate: string) => {
      if (!canEdit) return;
      try {
        await api.updateShift(shiftId, { personId: targetPersonId, date: targetDate });
        await fetchSchedule();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Move shift failed', 'error');
      }
    },
    [canEdit, fetchSchedule, showToast]
  );

  const handlePaste = useCallback(
    async (
      items: Array<{
        personId: string;
        date: string;
        assignmentTypeId: string;
        note?: string | null;
        customStartTime?: string | null;
        customEndTime?: string | null;
      }>,
      targetCells: Array<{ personId: string; date: string }>
    ) => {
      if (!canEdit) return;
      try {
        const res = await api.batchPaste(items, targetCells);
        pushUndo({
          description: 'Paste shifts',
          deleteIds: res.created.map((s) => s.id),
          restoreShifts: res.removed.map((s) => ({
            personId: s.personId,
            assignmentTypeId: s.assignmentTypeId,
            date: s.date,
            isLocked: s.isLocked,
            note: s.note,
            customStartTime: s.customStartTime,
            customEndTime: s.customEndTime,
            publishedPairId: s.publishedPairId ?? null,
          })),
        });
        showToast(
          `Pasted ${res.created.length} shift(s)${
            res.skippedLocked > 0 ? ` (skipped ${res.skippedLocked} locked)` : ''
          }`
        );
        await fetchSchedule();
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Paste failed', 'error');
      }
    },
    [canEdit, pushUndo, fetchSchedule, showToast]
  );

  const handleClickPaletteAssignment = (assignmentTypeId: string) => {
    if (!canEdit) return;
    if (!anchor || !focus) {
      showToast('Select cell(s) on the grid first, or drag the pill onto a cell.');
      return;
    }
    const minRow = Math.min(anchor.row, focus.row);
    const maxRow = Math.max(anchor.row, focus.row);
    const minCol = Math.min(anchor.col, focus.col);
    const maxCol = Math.max(anchor.col, focus.col);
    const cells: Array<{ personId: string; date: string }> = [];
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const p = visiblePeople[r];
        const d = days[c];
        if (p && d) cells.push({ personId: p.id, date: d });
      }
    }
    handleBatchAssign(assignmentTypeId, cells);
  };

  return (
    <div className="print-container flex h-screen flex-col overflow-hidden bg-slate-50">
      {/* Print-Only Wall Chart Header & Legend */}
      <div className="print-only mb-2 border-b border-slate-300 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-slate-900">
              Team &amp; Shift Schedule ({dateRangeLabel})
            </h1>
            <p className="text-[10px] text-slate-600">
              Printed {new Date().toLocaleDateString('en-US', { dateStyle: 'medium' })}
            </p>
          </div>
          <div className="rounded border border-slate-400 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-slate-800">
            {isAdmin && adminViewMode === 'DRAFT' ? 'DRAFT PREVIEW' : 'Published Schedule'}
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {data.assignmentTypes.map((at) => (
            <span
              key={at.id}
              style={{ backgroundColor: at.colorHex, color: getContrastTextColor(at.colorHex) }}
              className="rounded px-1.5 py-0.5 text-[9px] font-semibold"
            >
              {at.shortCode}: {at.name} ({at.startTime}–{at.endTime})
            </span>
          ))}
        </div>
      </div>

      <TopBar
        isAdmin={isAdmin}
        adminViewMode={adminViewMode}
        onChangeAdminViewMode={(m) => {
          setAdminViewMode(m);
          setAnchor(null);
          setFocus(null);
        }}
        unpublishedCount={data.unpublishedChangesCount ?? 0}
        onPublish={handlePublish}
        onDiscard={handleDiscard}
        publishing={publishing}
        rangeMode={rangeMode}
        onChangeRangeMode={setRangeMode}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        dateRangeLabel={dateRangeLabel}
        onPrev={() => setStartDate((d) => addDays(d, -dayCount))}
        onToday={() => setStartDate(getMondayOfWeek(new Date()))}
        onNext={() => setStartDate((d) => addDays(d, dayCount))}
        onOpenLogin={() => setShowLogin(true)}
        onLogout={async () => {
          await api.logout();
          setIsAdmin(false);
          setAnchor(null);
          setFocus(null);
          showToast('Logged out of Admin mode.');
        }}
        onOpenShortcuts={() => setShowShortcuts(true)}
        onOpenRoster={() => setShowRoster(true)}
        onOpenCategories={() => setShowCategories(true)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenRules={() => setShowRules(true)}
        onOpenTemplates={() => setShowTemplates(true)}
        onOpenAutoScheduler={() => setShowAutoScheduler(true)}
        onOpenStats={() => setShowStats(true)}
        onOpenSyncCalendar={() => setShowSyncCalendar(true)}
        onPrint={() => window.print()}
      />

      <FilterBar
        searchQuery={searchQuery}
        onChangeSearch={setSearchQuery}
        selectedCategoryId={selectedCategoryId}
        onChangeCategory={setSelectedCategoryId}
        selectedAssignmentId={selectedAssignmentId}
        onChangeAssignment={setSelectedAssignmentId}
        sortMode={sortMode}
        onChangeSort={setSortMode}
        categories={data.categories}
        assignmentTypes={data.assignmentTypes}
        canEdit={canEdit && viewMode === 'grid'}
        onClickPaletteAssignment={handleClickPaletteAssignment}
      />

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
          Loading schedule...
        </div>
      ) : viewMode === 'agenda' ? (
        <div className="flex-1 overflow-y-auto">
          <MyAgendaView
            days={days}
            people={visiblePeople}
            categories={data.categories}
            assignmentTypes={data.assignmentTypes}
            shifts={visibleShifts}
            unavailabilities={data.unavailabilities}
            isAdmin={isAdmin}
            onOpenSyncCalendar={() => setShowSyncCalendar(true)}
          />
        </div>
      ) : (
        <ScheduleGrid
          days={days}
          people={visiblePeople}
          assignmentTypes={data.assignmentTypes}
          shifts={visibleShifts}
          unavailabilities={data.unavailabilities}
          violations={data.violations}
          isAdmin={isAdmin}
          canEdit={canEdit}
          selectedCells={[]}
          anchor={anchor}
          focus={focus}
          onChangeSelection={(a, f) => {
            setAnchor(a);
            setFocus(f);
          }}
          onBatchAssign={handleBatchAssign}
          onBatchDelete={handleBatchDelete}
          onBatchLock={handleBatchLock}
          onTogglePto={handleTogglePto}
          onUpdateShiftNote={handleUpdateShiftNote}
          onMoveShift={handleMoveShift}
          onPaste={handlePaste}
          onUndo={handleUndo}
          onOpenPersonDrawer={(p) => setActivePersonDrawer(p)}
          onOpenShortcuts={() => setShowShortcuts(true)}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`no-print fixed right-4 bottom-4 z-50 rounded-lg px-3.5 py-2 text-xs font-medium text-white shadow-lg ${
            toast.type === 'error' ? 'bg-red-600' : 'bg-slate-900'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Modals */}
      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={() => {
            setShowLogin(false);
            setIsAdmin(true);
            setAdminViewMode('DRAFT');
            showToast('Signed in as Admin');
          }}
        />
      )}

      {showShortcuts && (
        <ShortcutsModal
          onClose={() => setShowShortcuts(false)}
          assignmentTypes={data.assignmentTypes}
        />
      )}

      {activePersonDrawer && (
        <PersonDrawer
          person={activePersonDrawer}
          assignmentTypes={data.assignmentTypes}
          unavailabilities={data.unavailabilities}
          onClose={() => setActivePersonDrawer(null)}
          onRefresh={fetchSchedule}
        />
      )}

      {showRoster && (
        <RosterModal
          people={data.people}
          onClose={() => setShowRoster(false)}
          onRefresh={fetchSchedule}
          onSelectPerson={(p) => setActivePersonDrawer(p)}
        />
      )}

      {showCategories && (
        <CategoriesAssignmentsModal
          categories={data.categories}
          assignmentTypes={data.assignmentTypes}
          onClose={() => setShowCategories(false)}
          onRefresh={fetchSchedule}
        />
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} onRefresh={fetchSchedule} />
      )}

      {showRules && (
        <RulesEngineModal
          assignmentTypes={data.assignmentTypes}
          categories={data.categories}
          onClose={() => setShowRules(false)}
          onRefresh={fetchSchedule}
        />
      )}

      {showTemplates && (
        <RotationTemplatesModal
          defaultStartDate={startYMD}
          onClose={() => setShowTemplates(false)}
          onApplied={async (res) => {
            pushUndo({
              description: 'Apply rotation template',
              deleteIds: res.created.map((s) => s.id),
              restoreShifts: res.removed.map((s) => ({
                personId: s.personId,
                assignmentTypeId: s.assignmentTypeId,
                date: s.date,
                isLocked: s.isLocked,
                note: s.note,
                customStartTime: s.customStartTime,
                customEndTime: s.customEndTime,
                publishedPairId: s.publishedPairId ?? null,
              })),
            });
            showToast(
              `Stamped ${res.created.length} shift(s) (skipped ${res.skippedLocked} locked, ${res.skippedConflicts} conflicts; ${res.violations.length} warnings)`
            );
            await fetchSchedule();
          }}
        />
      )}

      {showAutoScheduler && (
        <AutoSchedulerModal
          defaultStartDate={startYMD}
          defaultEndDate={endYMD}
          categories={data.categories}
          assignmentTypes={data.assignmentTypes}
          onClose={() => setShowAutoScheduler(false)}
          onApplied={async (res) => {
            if (res.created && res.removed) {
              pushUndo({
                description: 'Auto-fill schedule',
                deleteIds: res.created.map((s) => s.id),
                restoreShifts: res.removed.map((s) => ({
                  personId: s.personId,
                  assignmentTypeId: s.assignmentTypeId,
                  date: s.date,
                  isLocked: s.isLocked,
                  note: s.note,
                  customStartTime: s.customStartTime,
                  customEndTime: s.customEndTime,
                  publishedPairId: s.publishedPairId ?? null,
                })),
              });
            }
            showToast(`Auto-filled ${res.slotsFilled} slot(s); preserved ${res.lockedPreserved} locked.`);
            await fetchSchedule();
          }}
        />
      )}

      {showStats && (
        <StatsModal
          startDate={startYMD}
          endDate={endYMD}
          categories={data.categories}
          assignmentTypes={data.assignmentTypes}
          people={data.people}
          shifts={data.shifts}
          initialViewMode={adminViewMode}
          onClose={() => setShowStats(false)}
        />
      )}

      {showSyncCalendar && (
        <SyncCalendarModal people={data.people} onClose={() => setShowSyncCalendar(false)} />
      )}
    </div>
  );
}

export default App;
