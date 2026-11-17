import { PublishStatus } from '@prisma/client';
import {
  evaluateSchedule,
  type ConstraintViolation,
  type PersonWithAllowed,
  type ShiftLike,
} from './constraintEngine.js';
import { prisma } from './db.js';

export async function loadScheduleContext(viewMode: PublishStatus = PublishStatus.DRAFT) {
  const [shifts, unavailabilities, peopleRaw, assignmentTypes, rules] = await Promise.all([
    prisma.shift.findMany({ where: { status: viewMode } }),
    prisma.unavailability.findMany({ where: { status: viewMode } }),
    prisma.person.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { allowedAssignments: { select: { id: true } } },
    }),
    prisma.assignmentType.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.constraintRule.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  const people: PersonWithAllowed[] = peopleRaw.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    allowedAssignmentIds: p.allowedAssignments.map((a) => a.id),
  }));

  return { shifts, unavailabilities, people, assignmentTypes, rules };
}

export async function evaluateScheduleInDb(
  viewMode: PublishStatus = PublishStatus.DRAFT
): Promise<{
  violations: ConstraintViolation[];
  violationsByShiftId: Record<string, ConstraintViolation[]>;
}> {
  const ctx = await loadScheduleContext(viewMode);
  return evaluateSchedule(
    ctx.shifts,
    ctx.unavailabilities,
    ctx.people,
    ctx.assignmentTypes,
    ctx.rules
  );
}

export function checkCandidateHardBlocks(
  candidateIds: Set<string>,
  allShifts: ShiftLike[],
  ctx: Awaited<ReturnType<typeof loadScheduleContext>>
): {
  hardBlocks: ConstraintViolation[];
  allViolations: ConstraintViolation[];
} {
  const { violations } = evaluateSchedule(
    allShifts,
    ctx.unavailabilities,
    ctx.people,
    ctx.assignmentTypes,
    ctx.rules
  );
  const candidateViolations = violations.filter(
    (v) => v.shiftId !== null && candidateIds.has(v.shiftId)
  );
  const hardBlocks = candidateViolations.filter((v) => v.enforcement === 'HARD_BLOCK');
  return { hardBlocks, allViolations: candidateViolations };
}
