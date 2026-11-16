import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, Lock, MessageSquare, User } from 'lucide-react';
import type { AssignmentType, Category, Person, Shift } from '../types';
import { compareShiftsByTime, formatLongDate, getContrastTextColor } from '../utils';

interface MyAgendaViewProps {
  days: string[];
  people: Person[];
  categories: Category[];
  assignmentTypes: AssignmentType[];
  shifts: Shift[];
  isAdmin: boolean;
  onOpenSyncCalendar?: () => void;
}

const STORAGE_KEY = 'scheduler_agenda_person_id';

export const MyAgendaView: React.FC<MyAgendaViewProps> = ({
  days,
  people,
  categories,
  assignmentTypes,
  shifts,
  onOpenSyncCalendar,
}) => {
  const [selectedPersonId, setSelectedPersonId] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'ALL';
    } catch {
      return 'ALL';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, selectedPersonId);
    } catch {
      // ignore
    }
  }, [selectedPersonId]);

  const personMap = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const assignmentMap = useMemo(() => new Map(assignmentTypes.map((a) => [a.id, a])), [assignmentTypes]);

  const groupedByDay = useMemo(() => {
    return days.map((date) => {
      const dayShifts = shifts
        .filter((s) => s.date === date && (selectedPersonId === 'ALL' || s.personId === selectedPersonId))
        .sort((a, b) => {
          const timeCmp = compareShiftsByTime(a, b, assignmentMap);
          if (timeCmp !== 0) return timeCmp;
          const pA = personMap.get(a.personId)?.name ?? '';
          const pB = personMap.get(b.personId)?.name ?? '';
          return pA.localeCompare(pB);
        });

      return { date, shifts: dayShifts };
    });
  }, [days, shifts, selectedPersonId, assignmentMap, personMap]);

  return (
    <div className="mx-auto max-w-2xl px-3 py-4 sm:px-4">
      {/* Selector Card */}
      <div className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <User className="h-4 w-4 text-blue-600" />
            <span>My Agenda</span>
          </div>
          {onOpenSyncCalendar && (
            <button
              type="button"
              onClick={onOpenSyncCalendar}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 sm:hidden"
            >
              <Calendar className="h-3.5 w-3.5 text-blue-600" />
              <span>Sync</span>
            </button>
          )}
        </div>
        <select
          value={selectedPersonId}
          onChange={(e) => setSelectedPersonId(e.target.value)}
          aria-label="Select team member for agenda"
          className="h-9 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
        >
          <option value="ALL">All Staff (Day-by-Day)</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.role}
            </option>
          ))}
        </select>
      </div>

      {/* Chronological Day Cards */}
      <div className="space-y-4">
        {groupedByDay.map(({ date, shifts: dayShifts }) => {
          const isEmpty = dayShifts.length === 0;
          return (
            <section
              key={date}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xs"
            >
              <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3.5 py-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    {formatLongDate(date)}
                  </h3>
                </div>
                <span className="text-xs font-medium text-slate-500 tabular-nums">
                  {dayShifts.length} {dayShifts.length === 1 ? 'shift' : 'shifts'}
                </span>
              </div>

              {isEmpty ? (
                <div className="px-3.5 py-4 text-center text-xs text-slate-400">
                  No scheduled shifts
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {dayShifts.map((shift) => {
                    const person = personMap.get(shift.personId);
                    const at = assignmentMap.get(shift.assignmentTypeId);
                    const cat = at ? categoryMap.get(at.categoryId) : undefined;
                    const fg = at ? getContrastTextColor(at.colorHex) : '#FFFFFF';
                    const start = shift.customStartTime || at?.startTime || '';
                    const end = shift.customEndTime || at?.endTime || '';

                    return (
                      <div key={shift.id} className="px-3.5 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              style={{ backgroundColor: at?.colorHex || '#334155', color: fg }}
                              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold"
                            >
                              {at?.shortCode ?? 'SHIFT'}
                              {shift.isLocked && <Lock className="h-3 w-3 opacity-85" />}
                            </span>
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {at?.name ?? 'Assignment'}
                              </div>
                              {selectedPersonId === 'ALL' && person && (
                                <div className="text-xs text-slate-600">
                                  {person.name} <span className="text-slate-400">• {person.role}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 tabular-nums">
                              <Clock className="h-3 w-3 text-slate-400" />
                              <span>
                                {start}–{end}
                              </span>
                            </div>
                            {cat && (
                              <div className="mt-0.5">
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                  {cat.name}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {shift.note && (
                          <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200/80 bg-amber-50/80 px-2.5 py-1.5 text-xs text-amber-950">
                            <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                            <span>{shift.note}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};
