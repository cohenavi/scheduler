import type { AssignmentType, ConstraintRule, Unavailability } from '@prisma/client';

export type EnforcementMode = 'HARD_BLOCK' | 'SOFT_WARN';

export interface PersonWithAllowed {
  id: string;
  name: string;
  role: string;
  allowedAssignmentIds: string[];
}

export interface ConstraintViolation {
  shiftId: string | null;
  personId: string;
  personName: string;
  date: string;
  weekStart?: string;
  assignmentTypeId: string | null;
  assignmentShortCode: string;
  ruleId: string;
  ruleName: string;
  ruleType: string;
  enforcement: EnforcementMode;
  message: string;
}

export interface ShiftLike {
  id: string;
  personId: string;
  assignmentTypeId: string;
  date: string;
  customStartTime: string | null;
  customEndTime: string | null;
}

export interface EvaluateOptions {
  evalStartDate?: string;
  evalEndDate?: string;
}

function parseYMDToUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

function formatUtcMsToYMD(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysYMD(ymd: string, delta: number): string {
  return formatUtcMsToYMD(parseYMDToUtcMs(ymd) + delta * 86_400_000);
}

export function getDayOfWeekFromYMD(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
}

export function getMondayYMD(ymd: string): string {
  const dow = getDayOfWeekFromYMD(ymd); // 0 = Sun, 1 = Mon, ...
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDaysYMD(ymd, diff);
}

export function getSaturdayOfWeekendYMD(ymd: string): string | null {
  const dow = getDayOfWeekFromYMD(ymd);
  if (dow === 6) return ymd;
  if (dow === 0) return addDaysYMD(ymd, -1);
  return null;
}

export function enumerateWeeks(startYMD: string, endYMD: string): string[] {
  const weeks: string[] = [];
  let cur = getMondayYMD(startYMD);
  const endMon = getMondayYMD(endYMD);
  while (cur <= endMon) {
    weeks.push(cur);
    cur = addDaysYMD(cur, 7);
  }
  return weeks;
}

function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function getShiftInterval(
  shift: ShiftLike,
  at: AssignmentType
): { startMs: number; endMs: number; hours: number } {
  const dayMs = parseYMDToUtcMs(shift.date);
  const startStr = shift.customStartTime || at.startTime || '08:00';
  const endStr = shift.customEndTime || at.endTime || '17:00';
  const startMin = parseTimeToMinutes(startStr);
  let endMin = parseTimeToMinutes(endStr);
  if (endMin <= startMin) {
    endMin += 24 * 60; // overnight spillover
  }
  const startMs = dayMs + startMin * 60_000;
  const endMs = dayMs + endMin * 60_000;
  const hours = Math.round(((endMs - startMs) / 3_600_000) * 10) / 10;
  return { startMs, endMs, hours };
}

export function getUnavailInterval(u: Unavailability): { startMs: number; endMs: number } {
  const dayMs = parseYMDToUtcMs(u.date);
  if (u.timeBlock === 'AM') {
    return { startMs: dayMs, endMs: dayMs + 12 * 3_600_000 };
  }
  if (u.timeBlock === 'PM') {
    return { startMs: dayMs + 12 * 3_600_000, endMs: dayMs + 24 * 3_600_000 };
  }
  if (u.timeBlock === 'CUSTOM' && u.startTime && u.endTime) {
    const sMin = parseTimeToMinutes(u.startTime);
    let eMin = parseTimeToMinutes(u.endTime);
    if (eMin <= sMin) eMin += 24 * 60;
    return { startMs: dayMs + sMin * 60_000, endMs: dayMs + eMin * 60_000 };
  }
  return { startMs: dayMs, endMs: dayMs + 24 * 3_600_000 };
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function matchesRole(person: PersonWithAllowed, roleFilter: unknown): boolean {
  if (!roleFilter || typeof roleFilter !== 'string' || !roleFilter.trim()) return true;
  return person.role.trim().toLowerCase() === roleFilter.trim().toLowerCase();
}

export function evaluateSchedule(
  shifts: ShiftLike[],
  unavailabilities: Unavailability[],
  people: PersonWithAllowed[],
  assignmentTypes: AssignmentType[],
  rules: ConstraintRule[],
  options?: EvaluateOptions
): {
  violations: ConstraintViolation[];
  violationsByShiftId: Record<string, ConstraintViolation[]>;
} {
  const activeRules = rules.filter((r) => r.isActive);
  const personMap = new Map(people.map((p) => [p.id, p]));
  const atMap = new Map(assignmentTypes.map((a) => [a.id, a]));

  const unavailByPerson = new Map<string, Array<{ u: Unavailability; startMs: number; endMs: number }>>();
  for (const u of unavailabilities) {
    const arr = unavailByPerson.get(u.personId) ?? [];
    arr.push({ u, ...getUnavailInterval(u) });
    unavailByPerson.set(u.personId, arr);
  }

  const shiftsByPerson = new Map<
    string,
    Array<{ shift: ShiftLike; at: AssignmentType; startMs: number; endMs: number; hours: number; weekStart: string }>
  >();

  const weeksInShifts = new Set<string>();

  for (const s of shifts) {
    const at = atMap.get(s.assignmentTypeId);
    if (!at) continue;
    const interval = getShiftInterval(s, at);
    const weekStart = getMondayYMD(s.date);
    weeksInShifts.add(weekStart);
    const arr = shiftsByPerson.get(s.personId) ?? [];
    arr.push({ shift: s, at, ...interval, weekStart });
    shiftsByPerson.set(s.personId, arr);
  }

  const violations: ConstraintViolation[] = [];
  const violationsByShiftId: Record<string, ConstraintViolation[]> = {};

  const addShiftViolation = (
    shift: ShiftLike,
    person: PersonWithAllowed,
    at: AssignmentType,
    rule: ConstraintRule,
    message: string,
    overrideEnforcement?: EnforcementMode
  ) => {
    const enforcement: EnforcementMode =
      overrideEnforcement ?? (rule.enforcement === 'HARD_BLOCK' ? 'HARD_BLOCK' : 'SOFT_WARN');
    const v: ConstraintViolation = {
      shiftId: shift.id,
      personId: person.id,
      personName: person.name,
      date: shift.date,
      assignmentTypeId: at.id,
      assignmentShortCode: at.shortCode,
      ruleId: rule.id,
      ruleName: rule.name,
      ruleType: rule.ruleType,
      enforcement,
      message,
    };
    violations.push(v);
    if (!violationsByShiftId[shift.id]) violationsByShiftId[shift.id] = [];
    violationsByShiftId[shift.id].push(v);
  };

  // 1. Shift-level rule evaluation
  for (const [personId, pShifts] of shiftsByPerson.entries()) {
    const person = personMap.get(personId);
    if (!person) continue;
    const pUnavails = unavailByPerson.get(personId) ?? [];

    const sorted = [...pShifts].sort((a, b) => a.startMs - b.startMs);

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const { shift, at, startMs, endMs, weekStart } = item;

      for (const rule of activeRules) {
        if (rule.personId && rule.personId !== person.id) continue;

        const cfg = (rule.config ?? {}) as Record<string, unknown>;
        if (!matchesRole(person, cfg.role)) continue;

        if (
          rule.assignmentTypeId &&
          rule.assignmentTypeId !== at.id &&
          rule.ruleType !== 'SAME_DAY_EXCLUSION' &&
          rule.ruleType !== 'ASSIGNMENT_QUOTA' &&
          rule.ruleType !== 'WEEKEND_CAP'
        ) {
          continue;
        }

        if (rule.ruleType === 'QUALIFICATION') {
          if (
            person.allowedAssignmentIds.length > 0 &&
            !person.allowedAssignmentIds.includes(at.id)
          ) {
            addShiftViolation(
              shift,
              person,
              at,
              rule,
              `${person.name} is not qualified for ${at.name} (${at.shortCode}).`
            );
          }
        } else if (rule.ruleType === 'PTO_CONFLICT') {
          const hit = pUnavails.find((u) => intervalsOverlap(startMs, endMs, u.startMs, u.endMs));
          if (hit) {
            addShiftViolation(
              shift,
              person,
              at,
              rule,
              `Overlaps ${person.name}'s ${hit.u.timeBlock.replace('_', ' ')} PTO/unavailability on ${hit.u.date}.`
            );
          }
        } else if (rule.ruleType === 'DAY_OF_WEEK') {
          const dow = getDayOfWeekFromYMD(shift.date);
          if (!at.allowedDaysOfWeek.includes(dow)) {
            const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow];
            addShiftViolation(
              shift,
              person,
              at,
              rule,
              `${at.name} (${at.shortCode}) is not permitted on ${dayName}.`
            );
          }
        } else if (rule.ruleType === 'TIME_OVERLAP') {
          for (let j = 0; j < sorted.length; j++) {
            if (i === j) continue;
            const other = sorted[j];
            if (intervalsOverlap(startMs, endMs, other.startMs, other.endMs)) {
              if (j < i) {
                addShiftViolation(
                  shift,
                  person,
                  at,
                  rule,
                  `Time overlap with ${other.at.shortCode} (${other.shift.date} ${other.at.startTime}–${other.at.endTime}).`
                );
                break;
              }
            }
          }
        } else if (rule.ruleType === 'SAME_DAY_EXCLUSION') {
          const atA = cfg.assignmentTypeIdA ? String(cfg.assignmentTypeIdA) : null;
          const atB = cfg.assignmentTypeIdB ? String(cfg.assignmentTypeIdB) : null;
          const catA = cfg.categoryIdA ? String(cfg.categoryIdA) : null;
          const catB = cfg.categoryIdB ? String(cfg.categoryIdB) : null;

          for (let j = 0; j < sorted.length; j++) {
            if (j >= i) continue;
            const other = sorted[j];
            if (other.shift.date !== shift.date) continue;

            const matchPairAt =
              atA &&
              atB &&
              ((at.id === atA && other.at.id === atB) || (at.id === atB && other.at.id === atA));
            const matchPairCat =
              catA &&
              catB &&
              ((at.categoryId === catA && other.at.categoryId === catB) ||
                (at.categoryId === catB && other.at.categoryId === catA));

            if (matchPairAt || matchPairCat) {
              addShiftViolation(
                shift,
                person,
                at,
                rule,
                `${at.shortCode} cannot share the same day as ${other.at.shortCode}.`
              );
              break;
            }
          }
        } else if (rule.ruleType === 'WEEKEND_CAP') {
          const satYMD = getSaturdayOfWeekendYMD(shift.date);
          if (!satYMD) continue;

          const filterAtId = cfg.assignmentTypeId
            ? String(cfg.assignmentTypeId)
            : rule.assignmentTypeId;
          const filterCatId = cfg.categoryId ? String(cfg.categoryId) : null;

          const shiftMatches =
            (!filterAtId && !filterCatId) ||
            (filterAtId && at.id === filterAtId) ||
            (filterCatId && at.categoryId === filterCatId);
          if (!shiftMatches) continue;

          const maxWeekends = Math.max(0, Number(cfg.maxWeekends ?? 2));
          const periodWeeks = Math.max(1, Number(cfg.periodWeeks ?? 4));
          const windowStartSat = addDaysYMD(satYMD, -7 * (periodWeeks - 1));

          const workedSats = new Set<string>();
          for (const other of sorted) {
            const otherSat = getSaturdayOfWeekendYMD(other.shift.date);
            if (!otherSat) continue;
            if (otherSat < windowStartSat || otherSat > satYMD) continue;
            const otherMatches =
              (!filterAtId && !filterCatId) ||
              (filterAtId && other.at.id === filterAtId) ||
              (filterCatId && other.at.categoryId === filterCatId);
            if (otherMatches) {
              workedSats.add(otherSat);
            }
          }

          if (workedSats.size > maxWeekends) {
            addShiftViolation(
              shift,
              person,
              at,
              rule,
              `${person.name} worked ${workedSats.size} weekends in ${periodWeeks} weeks (cap: ${maxWeekends}).`
            );
          }
        } else if (rule.ruleType === 'ASSIGNMENT_QUOTA') {
          const maxDays =
            cfg.maxDaysPerWeek !== undefined && cfg.maxDaysPerWeek !== null && cfg.maxDaysPerWeek !== ''
              ? Number(cfg.maxDaysPerWeek)
              : null;
          if (maxDays === null || Number.isNaN(maxDays)) continue;

          const targetType = cfg.targetType === 'CATEGORY' || (!cfg.assignmentTypeId && !rule.assignmentTypeId && cfg.categoryId)
            ? 'CATEGORY'
            : 'ASSIGNMENT';
          const targetAtId = cfg.assignmentTypeId ? String(cfg.assignmentTypeId) : rule.assignmentTypeId;
          const targetCatId = cfg.categoryId ? String(cfg.categoryId) : null;

          const matchesTarget =
            targetType === 'CATEGORY'
              ? Boolean(targetCatId && at.categoryId === targetCatId)
              : Boolean(targetAtId && at.id === targetAtId);
          if (!matchesTarget) continue;

          const distinctDates = new Set(
            sorted
              .filter((x) => {
                if (x.weekStart !== weekStart) return false;
                return targetType === 'CATEGORY'
                  ? Boolean(targetCatId && x.at.categoryId === targetCatId)
                  : Boolean(targetAtId && x.at.id === targetAtId);
              })
              .map((x) => x.shift.date)
          );

          if (distinctDates.size > maxDays) {
            addShiftViolation(
              shift,
              person,
              at,
              rule,
              `${person.name} has ${distinctDates.size} ${at.shortCode} days in week of ${weekStart} (max: ${maxDays}).`
            );
          }
        }
      }
    }
  }

  // 2. Person-week minimum quota evaluation (ASSIGNMENT_QUOTA minDaysPerWeek)
  const evalWeeks =
    options?.evalStartDate && options?.evalEndDate
      ? enumerateWeeks(options.evalStartDate, options.evalEndDate)
      : Array.from(weeksInShifts).sort();

  if (evalWeeks.length > 0) {
    for (const rule of activeRules) {
      if (rule.ruleType !== 'ASSIGNMENT_QUOTA') continue;
      const cfg = (rule.config ?? {}) as Record<string, unknown>;
      const minDays =
        cfg.minDaysPerWeek !== undefined && cfg.minDaysPerWeek !== null && cfg.minDaysPerWeek !== ''
          ? Number(cfg.minDaysPerWeek)
          : null;
      if (minDays === null || Number.isNaN(minDays) || minDays <= 0) continue;

      const targetType =
        cfg.targetType === 'CATEGORY' || (!cfg.assignmentTypeId && !rule.assignmentTypeId && cfg.categoryId)
          ? 'CATEGORY'
          : 'ASSIGNMENT';
      const targetAtId = cfg.assignmentTypeId ? String(cfg.assignmentTypeId) : rule.assignmentTypeId;
      const targetCatId = cfg.categoryId ? String(cfg.categoryId) : null;

      if (targetType === 'ASSIGNMENT' && !targetAtId) continue;
      if (targetType === 'CATEGORY' && !targetCatId) continue;

      const targetAt = targetAtId ? atMap.get(targetAtId) ?? null : null;
      const categoryAtIds = targetCatId
        ? new Set(assignmentTypes.filter((a) => a.categoryId === targetCatId).map((a) => a.id))
        : new Set<string>();
      const targetLabel =
        targetType === 'ASSIGNMENT'
          ? targetAt?.shortCode ?? 'Assignment'
          : (cfg.categoryName ? String(cfg.categoryName) : 'Category');

      const onlyQualified = cfg.onlyQualified !== false;

      for (const person of people) {
        if (rule.personId && rule.personId !== person.id) continue;
        if (!matchesRole(person, cfg.role)) continue;

        if (onlyQualified && person.allowedAssignmentIds.length > 0) {
          if (targetType === 'ASSIGNMENT' && targetAtId) {
            if (!person.allowedAssignmentIds.includes(targetAtId)) continue;
          } else if (targetType === 'CATEGORY') {
            const hasAny = person.allowedAssignmentIds.some((id) => categoryAtIds.has(id));
            if (!hasAny) continue;
          }
        }

        const pShifts = shiftsByPerson.get(person.id) ?? [];

        for (const weekStart of evalWeeks) {
          const distinctDates = new Set<string>();
          for (const item of pShifts) {
            if (item.weekStart !== weekStart) continue;
            const matches =
              targetType === 'CATEGORY'
                ? Boolean(targetCatId && item.at.categoryId === targetCatId)
                : Boolean(targetAtId && item.at.id === targetAtId);
            if (matches) {
              distinctDates.add(item.shift.date);
            }
          }

          if (distinctDates.size < minDays) {
            violations.push({
              shiftId: null,
              personId: person.id,
              personName: person.name,
              date: weekStart,
              weekStart,
              assignmentTypeId: targetAtId ?? null,
              assignmentShortCode: targetLabel,
              ruleId: rule.id,
              ruleName: rule.name,
              ruleType: rule.ruleType,
              enforcement: 'SOFT_WARN',
              message: `${person.name} has ${distinctDates.size}/${minDays} ${targetLabel} day(s) for week of ${weekStart}.`,
            });
          }
        }
      }
    }
  }

  return { violations, violationsByShiftId };
}
