import { PublishStatus, type AssignmentType, type Category, type ConstraintRule } from '@prisma/client';
import {
  evaluateSchedule,
  getDayOfWeekFromYMD,
  getShiftInterval,
  type PersonWithAllowed,
  type ShiftLike,
} from './constraintEngine.js';
import { loadScheduleContext } from './constraintHelper.js';
import { prisma } from './db.js';
import { getUnpublishedChangesCount } from './scheduleService.js';

export interface AutoGenerateOptions {
  startDate: string;
  endDate: string;
  personIds?: string[];
  categoryIds?: string[];
  assignmentTypeIds?: string[];
  mode: 'FILL_GAPS' | 'REBALANCE_UNLOCKED';
  apply?: boolean;
}

function enumerateDates(startYMD: string, endYMD: string): string[] {
  const [sy, sm, sd] = startYMD.split('-').map(Number);
  const [ey, em, ed] = endYMD.split('-').map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  const dates: string[] = [];
  while (cur <= end) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cur.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function addDaysYMD(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate()
  ).padStart(2, '0')}`;
}

function computeCategoryVariance(
  shifts: ShiftLike[],
  people: PersonWithAllowed[],
  atMap: Map<string, AssignmentType>,
  categories: Category[]
) {
  return categories.map((cat) => {
    const hoursPerPerson = new Map<string, number>(people.map((p) => [p.id, 0]));
    for (const s of shifts) {
      const at = atMap.get(s.assignmentTypeId);
      if (!at || at.categoryId !== cat.id) continue;
      if (!hoursPerPerson.has(s.personId)) continue;
      const { hours } = getShiftInterval(s, at);
      hoursPerPerson.set(s.personId, (hoursPerPerson.get(s.personId) ?? 0) + hours);
    }
    const vals = Array.from(hoursPerPerson.values());
    const sum = vals.reduce((a, b) => a + b, 0);
    const avg = vals.length > 0 ? sum / vals.length : 0;
    const min = vals.length > 0 ? Math.min(...vals) : 0;
    const max = vals.length > 0 ? Math.max(...vals) : 0;
    const variance =
      vals.length > 0 ? vals.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / vals.length : 0;
    return {
      categoryId: cat.id,
      categoryName: cat.name,
      totalHours: Math.round(sum * 10) / 10,
      avgHours: Math.round(avg * 10) / 10,
      minHours: Math.round(min * 10) / 10,
      maxHours: Math.round(max * 10) / 10,
      stdDev: Math.round(Math.sqrt(variance) * 100) / 100,
    };
  });
}

export async function runAutoScheduler(options: AutoGenerateOptions) {
  const { startDate, endDate, personIds, categoryIds, assignmentTypeIds, mode, apply = false } =
    options;

  const [ctx, categories] = await Promise.all([
    loadScheduleContext(PublishStatus.DRAFT),
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);

  const atMap = new Map(ctx.assignmentTypes.map((a) => [a.id, a]));
  const dates = enumerateDates(startDate, endDate);

  // Filter candidate people & assignment types
  const candidatePeople =
    personIds && personIds.length > 0
      ? ctx.people.filter((p) => personIds.includes(p.id))
      : ctx.people;

  const targetAssignments = ctx.assignmentTypes.filter((at) => {
    if (assignmentTypeIds && assignmentTypeIds.length > 0 && !assignmentTypeIds.includes(at.id)) {
      return false;
    }
    if (categoryIds && categoryIds.length > 0 && !categoryIds.includes(at.categoryId)) {
      return false;
    }
    return true;
  });

  // Ensure solver enforces core hard constraints even if admin configured some as SOFT_WARN
  const solverRules: ConstraintRule[] = [
    ...ctx.rules.filter((r) => r.isActive),
    // Guarantee qualification, PTO, day-of-week, and time-overlap are respected during auto-fill
    ...(['QUALIFICATION', 'PTO_CONFLICT', 'DAY_OF_WEEK', 'TIME_OVERLAP'] as const).map((rt, i) => ({
      id: `solver-core-${i}`,
      name: rt,
      ruleType: rt,
      enforcement: 'HARD_BLOCK',
      assignmentTypeId: null,
      personId: null,
      config: {},
      isActive: true,
      priority: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  ];

  // Existing shifts before auto-generate (for before-variance comparison)
  const beforeShiftsInRange = ctx.shifts.filter((s) => s.date >= startDate && s.date <= endDate);
  const beforeVariance = computeCategoryVariance(beforeShiftsInRange, candidatePeople, atMap, categories);

  // Determine removed shifts if REBALANCE_UNLOCKED
  const targetAtSet = new Set(targetAssignments.map((a) => a.id));
  const targetPersonSet = new Set(candidatePeople.map((p) => p.id));

  const removedShifts =
    mode === 'REBALANCE_UNLOCKED'
      ? beforeShiftsInRange.filter(
          (s) => !s.isLocked && targetAtSet.has(s.assignmentTypeId) && targetPersonSet.has(s.personId)
        )
      : [];
  const removedIdSet = new Set(removedShifts.map((s) => s.id));

  const lockedPreserved = beforeShiftsInRange.filter((s) => s.isLocked).length;

  // Working shifts state
  const workingShifts: ShiftLike[] = ctx.shifts.filter((s) => !removedIdSet.has(s.id));

  // Build open slots
  interface OpenSlot {
    date: string;
    at: AssignmentType;
    validCount: number;
  }

  const openSlots: OpenSlot[] = [];
  for (const date of dates) {
    const dow = getDayOfWeekFromYMD(date);
    for (const at of targetAssignments) {
      if (!at.allowedDaysOfWeek.includes(dow)) continue;
      const alreadyFilled = workingShifts.filter(
        (s) => s.date === date && s.assignmentTypeId === at.id
      ).length;
      const needed = Math.max(0, (at.requiredStaffPerDay ?? 1) - alreadyFilled);
      for (let k = 0; k < needed; k++) {
        // Estimate valid candidates count for most-constrained-first ordering
        const qualifiedCount = candidatePeople.filter(
          (p) => p.allowedAssignmentIds.length === 0 || p.allowedAssignmentIds.includes(at.id)
        ).length;
        openSlots.push({ date, at, validCount: qualifiedCount });
      }
    }
  }

  // Sort most-constrained-first (scarce assignments / overnight call first)
  openSlots.sort((a, b) => {
    if (a.validCount !== b.validCount) return a.validCount - b.validCount;
    const aOvernight = a.at.endTime <= a.at.startTime ? 0 : 1;
    const bOvernight = b.at.endTime <= b.at.startTime ? 0 : 1;
    if (aOvernight !== bOvernight) return aOvernight - bOvernight;
    return a.date.localeCompare(b.date);
  });

  const proposedShifts: Array<{
    personId: string;
    personName: string;
    assignmentTypeId: string;
    assignmentShortCode: string;
    assignmentColor: string;
    date: string;
  }> = [];

  const unfilledGaps: Array<{
    date: string;
    assignmentTypeId: string;
    assignmentName: string;
    shortCode: string;
    reason: string;
  }> = [];

  for (let idx = 0; idx < openSlots.length; idx++) {
    const slot = openSlots[idx];
    const { date, at } = slot;
    const prevDate = addDaysYMD(date, -1);
    const nextDate = addDaysYMD(date, 1);

    const validCandidates: Array<{ person: PersonWithAllowed; score: number }> = [];

    for (const person of candidatePeople) {
      // Skip if already assigned this exact assignment on this date
      if (
        workingShifts.some(
          (s) => s.personId === person.id && s.date === date && s.assignmentTypeId === at.id
        )
      ) {
        continue;
      }

      const tempId = `auto-${idx}-${person.id}`;
      const candidate: ShiftLike = {
        id: tempId,
        personId: person.id,
        assignmentTypeId: at.id,
        date,
        customStartTime: null,
        customEndTime: null,
      };

      const { violations } = evaluateSchedule(
        [...workingShifts, candidate],
        ctx.unavailabilities,
        ctx.people,
        ctx.assignmentTypes,
        solverRules
      );

      // Any violation on the candidate (hard block or solver rule) disqualifies unless only soft workload
      const candidateViolations = violations.filter((v) => v.shiftId === tempId);
      const hasDisqualifying = candidateViolations.some(
        (v) => v.enforcement === 'HARD_BLOCK' || v.ruleType === 'WORKLOAD_CAP'
      );
      if (hasDisqualifying) continue;

      // Fairness Scoring:
      // 1. Lowest cumulative hours in this Category
      let catHours = 0;
      let totalHours = 0;
      let adjacentSameCount = 0;

      for (const s of workingShifts) {
        if (s.personId !== person.id) continue;
        const sAt = atMap.get(s.assignmentTypeId);
        if (!sAt) continue;
        const { hours } = getShiftInterval(s, sAt);
        if (s.date >= startDate && s.date <= endDate) {
          totalHours += hours;
          if (sAt.categoryId === at.categoryId) {
            catHours += hours;
          }
        }
        if (s.assignmentTypeId === at.id && (s.date === prevDate || s.date === nextDate)) {
          adjacentSameCount++;
        }
      }

      const capRatio = person.maxHoursPerWeek ? totalHours / person.maxHoursPerWeek : totalHours / 40;
      const score = catHours * 10 + capRatio * 20 + adjacentSameCount * 15;
      validCandidates.push({ person, score });
    }

    if (validCandidates.length === 0) {
      unfilledGaps.push({
        date,
        assignmentTypeId: at.id,
        assignmentName: at.name,
        shortCode: at.shortCode,
        reason: 'No qualified staff available without violating PTO, overlap, rest gap, or weekly caps',
      });
      continue;
    }

    validCandidates.sort((a, b) => a.score - b.score);
    const chosen = validCandidates[0].person;

    const newShift: ShiftLike = {
      id: `auto-accepted-${idx}`,
      personId: chosen.id,
      assignmentTypeId: at.id,
      date,
      customStartTime: null,
      customEndTime: null,
    };
    workingShifts.push(newShift);

    proposedShifts.push({
      personId: chosen.id,
      personName: chosen.name,
      assignmentTypeId: at.id,
      assignmentShortCode: at.shortCode,
      assignmentColor: at.colorHex,
      date,
    });
  }

  const afterShiftsInRange = workingShifts.filter((s) => s.date >= startDate && s.date <= endDate);
  const afterVariance = computeCategoryVariance(afterShiftsInRange, candidatePeople, atMap, categories);

  if (!apply) {
    return {
      applied: false,
      slotsFilled: proposedShifts.length,
      lockedPreserved,
      removedCount: removedShifts.length,
      proposedShifts,
      unfilledGaps,
      categoryVariance: {
        before: beforeVariance,
        after: afterVariance,
      },
    };
  }

  // Persist to DB as DRAFT
  const created = await prisma.$transaction(async (tx) => {
    if (removedShifts.length > 0) {
      await tx.shift.deleteMany({ where: { id: { in: removedShifts.map((s) => s.id) } } });
    }
    const inserted = [];
    for (const p of proposedShifts) {
      const s = await tx.shift.create({
        data: {
          personId: p.personId,
          assignmentTypeId: p.assignmentTypeId,
          date: p.date,
          status: PublishStatus.DRAFT,
          isLocked: false,
        },
      });
      inserted.push(s);
    }
    return inserted;
  });

  const unpublishedChangesCount = await getUnpublishedChangesCount();
  return {
    applied: true,
    created,
    removed: removedShifts,
    slotsFilled: created.length,
    lockedPreserved,
    unfilledGaps,
    categoryVariance: {
      before: beforeVariance,
      after: afterVariance,
    },
    unpublishedChangesCount,
  };
}
