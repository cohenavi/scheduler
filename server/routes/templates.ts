import { PublishStatus, TimeBlock } from '@prisma/client';
import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { checkCandidateHardBlocks, loadScheduleContext } from '../constraintHelper.js';
import { prisma } from '../db.js';
import { getUnpublishedChangesCount } from '../scheduleService.js';

export const templatesRouter = Router();

templatesRouter.use(requireAdmin);

function parseYMD(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function formatYMD(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysYMD(ymd: string, days: number): string {
  const d = parseYMD(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return formatYMD(d);
}

templatesRouter.get('/', async (_req, res) => {
  try {
    const templates = await prisma.scheduleTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        entries: true,
      },
    });
    res.json(templates);
  } catch (err) {
    console.error('List templates error:', err);
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

// Save a 1-, 2-, or 4-week block of DRAFT shifts as a Rotation Template
templatesRouter.post('/', async (req, res) => {
  try {
    const { name, description, cycleWeeks = 1, startDate } = req.body ?? {};
    if (!name || !startDate) {
      res.status(400).json({ error: 'Template name and startDate are required' });
      return;
    }

    const weeks = Math.max(1, Math.min(4, Number(cycleWeeks) || 1));
    const totalDays = weeks * 7;
    const endDate = addDaysYMD(startDate, totalDays - 1);

    const shifts = await prisma.shift.findMany({
      where: {
        status: PublishStatus.DRAFT,
        date: { gte: startDate, lte: endDate },
      },
    });

    const startMs = parseYMD(startDate).getTime();

    const template = await prisma.scheduleTemplate.create({
      data: {
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        cycleWeeks: weeks,
        entries: {
          create: shifts.map((s) => {
            const offset = Math.round((parseYMD(s.date).getTime() - startMs) / 86_400_000);
            return {
              weekIndex: Math.floor(offset / 7),
              dayOfWeek: offset % 7,
              personId: s.personId,
              assignmentTypeId: s.assignmentTypeId,
              note: s.note,
              customStartTime: s.customStartTime,
              customEndTime: s.customEndTime,
            };
          }),
        },
      },
      include: { entries: true },
    });

    res.status(201).json(template);
  } catch (err) {
    console.error('Create template error:', err);
    res.status(500).json({ error: 'Failed to save rotation template' });
  }
});

templatesRouter.delete('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    await prisma.scheduleTemplate.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete template error:', err);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// Apply (Stamp) a Rotation Template onto a target start date or full month
templatesRouter.post('/:id/apply', async (req, res) => {
  try {
    const id = String(req.params.id);
    const {
      targetStartDate,
      repeatAcrossMonth = false,
      targetMonth,
      mode = 'MERGE',
      conflictMode = 'SKIP_CONFLICTS',
    } = req.body ?? {};

    const template = await prisma.scheduleTemplate.findUnique({
      where: { id },
      include: { entries: true },
    });
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const cycleDays = template.cycleWeeks * 7;
    const targetSlots: Array<{
      date: string;
      personId: string;
      assignmentTypeId: string;
      note: string | null;
      customStartTime: string | null;
      customEndTime: string | null;
    }> = [];

    let rangeStart = '';
    let rangeEnd = '';

    if (repeatAcrossMonth && typeof targetMonth === 'string' && /^\d{4}-\d{2}$/.test(targetMonth)) {
      const [year, month] = targetMonth.split('-').map(Number);
      const firstDay = new Date(Date.UTC(year, month - 1, 1));
      const lastDay = new Date(Date.UTC(year, month, 0));
      rangeStart = formatYMD(firstDay);
      rangeEnd = formatYMD(lastDay);

      const daysInMonth = lastDay.getUTCDate();
      for (let dOffset = 0; dOffset < daysInMonth; dOffset++) {
        const currentYMD = addDaysYMD(rangeStart, dOffset);
        const cycleOffset = dOffset % cycleDays;
        const weekIdx = Math.floor(cycleOffset / 7);
        const dayIdx = cycleOffset % 7;

        for (const entry of template.entries) {
          if (entry.weekIndex === weekIdx && entry.dayOfWeek === dayIdx && entry.personId) {
            targetSlots.push({
              date: currentYMD,
              personId: entry.personId,
              assignmentTypeId: entry.assignmentTypeId,
              note: entry.note,
              customStartTime: entry.customStartTime,
              customEndTime: entry.customEndTime,
            });
          }
        }
      }
    } else if (typeof targetStartDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(targetStartDate)) {
      rangeStart = targetStartDate;
      rangeEnd = addDaysYMD(targetStartDate, cycleDays - 1);

      for (const entry of template.entries) {
        if (!entry.personId) continue;
        const offset = entry.weekIndex * 7 + entry.dayOfWeek;
        const date = addDaysYMD(targetStartDate, offset);
        targetSlots.push({
          date,
          personId: entry.personId,
          assignmentTypeId: entry.assignmentTypeId,
          note: entry.note,
          customStartTime: entry.customStartTime,
          customEndTime: entry.customEndTime,
        });
      }
    } else {
      res.status(400).json({ error: 'Provide targetStartDate or repeatAcrossMonth with targetMonth' });
      return;
    }

    const ctx = await loadScheduleContext(PublishStatus.DRAFT);

    // Determine existing shifts in range
    const existingInRange = ctx.shifts.filter((s) => s.date >= rangeStart && s.date <= rangeEnd);
    const lockedCells = new Set(
      existingInRange.filter((s) => s.isLocked).map((s) => `${s.personId}::${s.date}`)
    );

    const removedShifts =
      mode === 'REPLACE_UNLOCKED' ? existingInRange.filter((s) => !s.isLocked) : [];
    const removedIds = new Set(removedShifts.map((s) => s.id));

    const remainingShifts = ctx.shifts.filter((s) => !removedIds.has(s.id));

    const ptoFullDaySet = new Set(
      ctx.unavailabilities
        .filter((u) => u.timeBlock === TimeBlock.FULL_DAY)
        .map((u) => `${u.personId}::${u.date}`)
    );

    let skippedLocked = 0;
    let skippedConflicts = 0;
    const acceptedSlots: typeof targetSlots = [];

    // Filter locked cells first, then evaluate constraints incrementally
    const simulatedShifts = [...remainingShifts];
    const candidateIds = new Set<string>();

    for (let idx = 0; idx < targetSlots.length; idx++) {
      const slot = targetSlots[idx];
      const cellKey = `${slot.personId}::${slot.date}`;
      if (lockedCells.has(cellKey)) {
        skippedLocked++;
        continue;
      }
      if (mode === 'MERGE') {
        const alreadySame = simulatedShifts.some(
          (s) =>
            s.personId === slot.personId &&
            s.date === slot.date &&
            s.assignmentTypeId === slot.assignmentTypeId
        );
        if (alreadySame) continue;
      }

      const tempId = `temp-tpl-${idx}`;
      const candidate = {
        id: tempId,
        personId: slot.personId,
        assignmentTypeId: slot.assignmentTypeId,
        date: slot.date,
        customStartTime: slot.customStartTime,
        customEndTime: slot.customEndTime,
      };

      const { hardBlocks } = checkCandidateHardBlocks(
        new Set([tempId]),
        [...simulatedShifts, candidate],
        ctx
      );

      if (hardBlocks.length > 0) {
        if (conflictMode === 'ATOMIC_ROLLBACK') {
          res.status(400).json({
            error: `Template stamp rolled back due to constraint violation: ${hardBlocks[0].message}`,
            violations: hardBlocks,
          });
          return;
        }
        skippedConflicts++;
        continue;
      }

      // Also skip if full day PTO and PTO_CONFLICT rule wasn't hard-blocking? No, let rule engine decide,
      // but track PTO awareness
      void ptoFullDaySet;

      simulatedShifts.push({
        ...candidate,
        status: PublishStatus.DRAFT,
        isLocked: false,
        note: slot.note,
        publishedPairId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      candidateIds.add(tempId);
      acceptedSlots.push(slot);
    }

    // Evaluate all soft warnings on accepted slots
    const { allViolations } = checkCandidateHardBlocks(candidateIds, simulatedShifts, ctx);

    // Persist in transaction
    const created = await prisma.$transaction(async (tx) => {
      if (removedShifts.length > 0) {
        await tx.shift.deleteMany({ where: { id: { in: removedShifts.map((s) => s.id) } } });
      }
      const inserted = [];
      for (const slot of acceptedSlots) {
        const s = await tx.shift.create({
          data: {
            personId: slot.personId,
            assignmentTypeId: slot.assignmentTypeId,
            date: slot.date,
            status: PublishStatus.DRAFT,
            isLocked: false,
            note: slot.note,
            customStartTime: slot.customStartTime,
            customEndTime: slot.customEndTime,
          },
        });
        inserted.push(s);
      }
      return inserted;
    });

    const unpublishedChangesCount = await getUnpublishedChangesCount();
    res.json({
      created,
      removed: removedShifts,
      skippedLocked,
      skippedConflicts,
      violations: allViolations,
      unpublishedChangesCount,
    });
  } catch (err) {
    console.error('Apply template error:', err);
    res.status(500).json({ error: 'Failed to apply rotation template' });
  }
});
