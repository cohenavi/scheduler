import type { AssignmentType, ConstraintRule, Shift, Unavailability } from '@prisma/client';

export type EnforcementMode = 'HARD_BLOCK' | 'SOFT_WARN';

export interface PersonWithAllowed {
  id: string;
  name: string;
  role: string;
  maxShiftsPerWeek: number | null;
  maxHoursPerWeek: number | null;
  allowedAssignmentIds: string[];
}

export interface ConstraintViolation {
  shiftId: string;
  personId: string;
  personName: string;
  date: string;
  assignmentTypeId: string;
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

function parseYMDToUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function getDayOfWeekFromYMD(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
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

export function evaluateSchedule(
  shifts: ShiftLike[],
  unavailabilities: Unavailability[],
  people: PersonWithAllowed[],
  assignmentTypes: AssignmentType[],
  rules: ConstraintRule[]
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
    Array<{ shift: ShiftLike; at: AssignmentType; startMs: number; endMs: number; hours: number; dayMs: number }>
  >();

  for (const s of shifts) {
    const at = atMap.get(s.assignmentTypeId);
    if (!at) continue;
    const interval = getShiftInterval(s, at);
    const arr = shiftsByPerson.get(s.personId) ?? [];
    arr.push({ shift: s, at, ...interval, dayMs: parseYMDToUtcMs(s.date) });
    shiftsByPerson.set(s.personId, arr);
  }

  const violations: ConstraintViolation[] = [];
  const violationsByShiftId: Record<string, ConstraintViolation[]> = {};

  const addViolation = (
    shift: ShiftLike,
    person: PersonWithAllowed,
    at: AssignmentType,
    rule: ConstraintRule,
    message: string
  ) => {
    const enforcement: EnforcementMode =
      rule.enforcement === 'HARD_BLOCK' ? 'HARD_BLOCK' : 'SOFT_WARN';
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

  for (const [personId, pShifts] of shiftsByPerson.entries()) {
    const person = personMap.get(personId);
    if (!person) continue;
    const pUnavails = unavailByPerson.get(personId) ?? [];

    // Sort person's shifts chronologically for turnaround & rolling window checks
    const sorted = [...pShifts].sort((a, b) => a.startMs - b.startMs);

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const { shift, at, startMs, endMs, dayMs } = item;

      for (const rule of activeRules) {
        if (rule.personId && rule.personId !== person.id) continue;
        if (rule.assignmentTypeId && rule.assignmentTypeId !== at.id && rule.ruleType !== 'MUTUAL_EXCLUSION_AND_REST') {
          continue;
        }

        const cfg = (rule.config ?? {}) as Record<string, unknown>;

        if (rule.ruleType === 'QUALIFICATION') {
          if (
            person.allowedAssignmentIds.length > 0 &&
            !person.allowedAssignmentIds.includes(at.id)
          ) {
            addViolation(
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
            addViolation(
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
            addViolation(
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
              // Avoid duplicate pair messages by only reporting on the later or second index
              if (j < i) {
                addViolation(
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
        } else if (rule.ruleType === 'MUTUAL_EXCLUSION_AND_REST') {
          const mode = String(cfg.mode || 'MIN_REST_HOURS');
          if (mode === 'MIN_REST_HOURS') {
            const minRestHours = Number(cfg.minRestHours ?? 12);
            const fromAtId = cfg.fromAssignmentTypeId ? String(cfg.fromAssignmentTypeId) : rule.assignmentTypeId;
            const fromCatId = cfg.fromCategoryId ? String(cfg.fromCategoryId) : null;

            for (let j = 0; j < sorted.length; j++) {
              if (i === j) continue;
              const prev = sorted[j];
              if (prev.endMs <= startMs) {
                const matchesSource =
                  (!fromAtId && !fromCatId) ||
                  (fromAtId && prev.at.id === fromAtId) ||
                  (fromCatId && prev.at.categoryId === fromCatId);

                if (matchesSource) {
                  const gapHours = (startMs - prev.endMs) / 3_600_000;
                  if (gapHours < minRestHours) {
                    addViolation(
                      shift,
                      person,
                      at,
                      rule,
                      `Only ${Math.round(gapHours * 10) / 10}h rest after ${prev.at.shortCode} (requires ${minRestHours}h).`
                    );
                    break;
                  }
                }
              }
            }
          } else if (mode === 'SAME_DAY_EXCLUSION') {
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
                addViolation(
                  shift,
                  person,
                  at,
                  rule,
                  `${at.shortCode} cannot share the same day as ${other.at.shortCode}.`
                );
                break;
              }
            }
          }
        } else if (rule.ruleType === 'WORKLOAD_CAP') {
          // Rolling 7-day window ending on shift.date (dayMs - 6 days .. dayMs)
          const windowStart = dayMs - 6 * 86_400_000;
          const inWindow = sorted.filter((x) => x.dayMs >= windowStart && x.dayMs <= dayMs);
          const totalShifts = inWindow.length;
          const totalHours = inWindow.reduce((sum, x) => sum + x.hours, 0);

          if (person.maxShiftsPerWeek !== null && totalShifts > person.maxShiftsPerWeek) {
            addViolation(
              shift,
              person,
              at,
              rule,
              `${person.name} has ${totalShifts} shifts in 7 days (cap: ${person.maxShiftsPerWeek}).`
            );
          } else if (person.maxHoursPerWeek !== null && totalHours > person.maxHoursPerWeek) {
            addViolation(
              shift,
              person,
              at,
              rule,
              `${person.name} has ${Math.round(totalHours * 10) / 10}h in 7 days (cap: ${person.maxHoursPerWeek}h).`
            );
          }
        }
      }
    }
  }

  return { violations, violationsByShiftId };
}
