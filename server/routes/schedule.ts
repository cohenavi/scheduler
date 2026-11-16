import { PublishStatus, TimeBlock } from '@prisma/client';
import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { runAutoScheduler } from '../autoScheduler.js';
import { evaluateSchedule } from '../constraintEngine.js';
import { checkCandidateHardBlocks, loadScheduleContext } from '../constraintHelper.js';
import { prisma } from '../db.js';
import {
  discardAllDrafts,
  getUnpublishedChangesCount,
  publishAllDrafts,
} from '../scheduleService.js';

export const scheduleRouter = Router();

// Public View-Only Schedule Endpoint (Strictly PUBLISHED, strips admin-only data)
scheduleRouter.get('/public', async (req, res) => {
  try {
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;

    const dateFilter =
      startDate && endDate
        ? { gte: startDate, lte: endDate }
        : startDate
          ? { gte: startDate }
          : endDate
            ? { lte: endDate }
            : undefined;

    const [people, categories, assignmentTypes, shifts, unavailabilities] = await Promise.all([
      prisma.person.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          role: true,
          sortOrder: true,
        },
      }),
      prisma.category.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          sortOrder: true,
        },
      }),
      prisma.assignmentType.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          categoryId: true,
          name: true,
          shortCode: true,
          colorHex: true,
          allowedDaysOfWeek: true,
          timeBlockLabel: true,
          startTime: true,
          endTime: true,
          sortOrder: true,
        },
      }),
      prisma.shift.findMany({
        where: {
          status: PublishStatus.PUBLISHED,
          ...(dateFilter ? { date: dateFilter } : {}),
        },
        select: {
          id: true,
          personId: true,
          assignmentTypeId: true,
          date: true,
          isLocked: true,
          note: true,
          customStartTime: true,
          customEndTime: true,
        },
      }),
      prisma.unavailability.findMany({
        where: {
          status: PublishStatus.PUBLISHED,
          ...(dateFilter ? { date: dateFilter } : {}),
        },
        select: {
          id: true,
          personId: true,
          date: true,
          timeBlock: true,
          startTime: true,
          endTime: true,
          // Intentionally omit private `note` in public response
        },
      }),
    ]);

    res.json({
      people,
      categories,
      assignmentTypes,
      shifts,
      unavailabilities,
    });
  } catch (err) {
    console.error('Public schedule error:', err);
    res.status(500).json({ error: 'Failed to load public schedule' });
  }
});

// Admin Schedule Endpoint
scheduleRouter.get('/admin', requireAdmin, async (req, res) => {
  try {
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
    const viewMode = req.query.viewMode === 'PUBLISHED' ? PublishStatus.PUBLISHED : PublishStatus.DRAFT;

    const dateFilter =
      startDate && endDate
        ? { gte: startDate, lte: endDate }
        : startDate
          ? { gte: startDate }
          : endDate
            ? { lte: endDate }
            : undefined;

    const [
      peopleRaw,
      categories,
      assignmentTypes,
      allViewShifts,
      allViewUnavails,
      rules,
      unpublishedChangesCount,
    ] = await Promise.all([
      prisma.person.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          allowedAssignments: {
            select: { id: true },
          },
        },
      }),
      prisma.category.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.assignmentType.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.shift.findMany({
        where: { status: viewMode },
      }),
      prisma.unavailability.findMany({
        where: { status: viewMode },
      }),
      prisma.constraintRule.findMany({
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      }),
      getUnpublishedChangesCount(),
    ]);

    const people = peopleRaw.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      calendarToken: p.calendarToken,
      maxShiftsPerWeek: p.maxShiftsPerWeek,
      maxHoursPerWeek: p.maxHoursPerWeek,
      sortOrder: p.sortOrder,
      allowedAssignmentIds: p.allowedAssignments.map((a) => a.id),
    }));

    const { violations: allViolations } = evaluateSchedule(
      allViewShifts,
      allViewUnavails,
      people,
      assignmentTypes,
      rules
    );

    const shifts = dateFilter
      ? allViewShifts.filter(
          (s) =>
            (!startDate || s.date >= startDate) && (!endDate || s.date <= endDate)
        )
      : allViewShifts;

    const unavailabilities = dateFilter
      ? allViewUnavails.filter(
          (u) =>
            (!startDate || u.date >= startDate) && (!endDate || u.date <= endDate)
        )
      : allViewUnavails;

    const shiftIdSet = new Set(shifts.map((s) => s.id));
    const violations = allViolations.filter((v) => shiftIdSet.has(v.shiftId));

    res.json({
      people,
      categories,
      assignmentTypes,
      shifts,
      unavailabilities,
      rules,
      violations,
      unpublishedChangesCount,
      viewMode,
    });
  } catch (err) {
    console.error('Admin schedule error:', err);
    res.status(500).json({ error: 'Failed to load admin schedule' });
  }
});

// Publish all DRAFT changes to PUBLISHED
scheduleRouter.post('/publish', requireAdmin, async (_req, res) => {
  try {
    const result = await publishAllDrafts();
    const unpublishedChangesCount = await getUnpublishedChangesCount();
    res.json({ ...result, unpublishedChangesCount });
  } catch (err) {
    console.error('Publish error:', err);
    res.status(500).json({ error: 'Failed to publish changes' });
  }
});

// Discard all DRAFT changes and revert to PUBLISHED
scheduleRouter.post('/discard', requireAdmin, async (_req, res) => {
  try {
    const result = await discardAllDrafts();
    const unpublishedChangesCount = await getUnpublishedChangesCount();
    res.json({ ...result, unpublishedChangesCount });
  } catch (err) {
    console.error('Discard drafts error:', err);
    res.status(500).json({ error: 'Failed to discard drafts' });
  }
});

// Create single DRAFT shift
scheduleRouter.post('/shifts', requireAdmin, async (req, res) => {
  try {
    const { personId, assignmentTypeId, date, note, customStartTime, customEndTime, isLocked } = req.body ?? {};
    if (!personId || !assignmentTypeId || !date) {
      res.status(400).json({ error: 'personId, assignmentTypeId, and date are required' });
      return;
    }

    const sanitizedNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, 160) : null;
    const ctx = await loadScheduleContext(PublishStatus.DRAFT);
    const candidate = {
      id: 'candidate-create',
      personId,
      assignmentTypeId,
      date,
      customStartTime: customStartTime || null,
      customEndTime: customEndTime || null,
    };
    const { hardBlocks } = checkCandidateHardBlocks(
      new Set(['candidate-create']),
      [...ctx.shifts, candidate],
      ctx
    );
    if (hardBlocks.length > 0) {
      res.status(400).json({
        error: hardBlocks[0].message,
        violations: hardBlocks,
      });
      return;
    }

    const shift = await prisma.shift.create({
      data: {
        personId,
        assignmentTypeId,
        date,
        status: PublishStatus.DRAFT,
        isLocked: Boolean(isLocked),
        note: sanitizedNote,
        customStartTime: customStartTime || null,
        customEndTime: customEndTime || null,
      },
    });

    const unpublishedChangesCount = await getUnpublishedChangesCount();
    res.status(201).json({ shift, unpublishedChangesCount });
  } catch (err) {
    console.error('Create shift error:', err);
    res.status(500).json({ error: 'Failed to create shift' });
  }
});

// Update single DRAFT shift
scheduleRouter.patch('/shifts/:id', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.shift.findUnique({ where: { id } });
    if (!existing || existing.status !== PublishStatus.DRAFT) {
      res.status(404).json({ error: 'Draft shift not found' });
      return;
    }

    const { personId, assignmentTypeId, date, note, isLocked, customStartTime, customEndTime } = req.body ?? {};

    if (
      existing.isLocked &&
      isLocked === undefined &&
      (personId !== undefined || assignmentTypeId !== undefined || date !== undefined)
    ) {
      res.status(409).json({ error: 'Shift is locked. Unlock it before moving or changing assignment.' });
      return;
    }

    if (
      personId !== undefined ||
      assignmentTypeId !== undefined ||
      date !== undefined ||
      customStartTime !== undefined ||
      customEndTime !== undefined
    ) {
      const ctx = await loadScheduleContext(PublishStatus.DRAFT);
      const updatedCandidate = {
        id: existing.id,
        personId: personId ?? existing.personId,
        assignmentTypeId: assignmentTypeId ?? existing.assignmentTypeId,
        date: date ?? existing.date,
        customStartTime: customStartTime !== undefined ? customStartTime || null : existing.customStartTime,
        customEndTime: customEndTime !== undefined ? customEndTime || null : existing.customEndTime,
      };
      const simulated = ctx.shifts.map((s) => (s.id === existing.id ? updatedCandidate : s));
      const { hardBlocks } = checkCandidateHardBlocks(new Set([existing.id]), simulated, ctx);
      if (hardBlocks.length > 0) {
        res.status(400).json({
          error: hardBlocks[0].message,
          violations: hardBlocks,
        });
        return;
      }
    }

    const data: Record<string, unknown> = {};
    if (personId !== undefined) data.personId = personId;
    if (assignmentTypeId !== undefined) data.assignmentTypeId = assignmentTypeId;
    if (date !== undefined) data.date = date;
    if (isLocked !== undefined) data.isLocked = Boolean(isLocked);
    if (note !== undefined) {
      data.note = typeof note === 'string' && note.trim() ? note.trim().slice(0, 160) : null;
    }
    if (customStartTime !== undefined) data.customStartTime = customStartTime || null;
    if (customEndTime !== undefined) data.customEndTime = customEndTime || null;

    const shift = await prisma.shift.update({
      where: { id },
      data,
    });

    const unpublishedChangesCount = await getUnpublishedChangesCount();
    res.json({ shift, unpublishedChangesCount });
  } catch (err) {
    console.error('Update shift error:', err);
    res.status(500).json({ error: 'Failed to update shift' });
  }
});

// Delete single DRAFT shift
scheduleRouter.delete('/shifts/:id', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.shift.findUnique({ where: { id } });
    if (!existing || existing.status !== PublishStatus.DRAFT) {
      res.status(404).json({ error: 'Draft shift not found' });
      return;
    }

    if (existing.isLocked) {
      res.status(409).json({ error: 'Locked shift cannot be deleted until unlocked' });
      return;
    }

    await prisma.shift.delete({ where: { id } });
    const unpublishedChangesCount = await getUnpublishedChangesCount();
    res.json({ deleted: existing, unpublishedChangesCount });
  } catch (err) {
    console.error('Delete shift error:', err);
    res.status(500).json({ error: 'Failed to delete shift' });
  }
});

// Batch Operations (assign, lock, paste, restore)
scheduleRouter.post('/batch', requireAdmin, async (req, res) => {
  try {
    const { action } = req.body ?? {};

    if (action === 'assign') {
      const {
        assignmentTypeId,
        cells,
        replaceExisting = false,
        conflictMode = 'ATOMIC_ROLLBACK',
      } = req.body as {
        assignmentTypeId: string;
        cells: Array<{ personId: string; date: string }>;
        replaceExisting?: boolean;
        conflictMode?: 'SKIP_CONFLICTS' | 'ATOMIC_ROLLBACK';
      };

      if (!assignmentTypeId || !Array.isArray(cells) || cells.length === 0) {
        res.status(400).json({ error: 'assignmentTypeId and cells are required' });
        return;
      }

      const ctx = await loadScheduleContext(PublishStatus.DRAFT);
      const ptoSet = new Set(
        ctx.unavailabilities
          .filter((u) => u.timeBlock === TimeBlock.FULL_DAY)
          .map((u) => `${u.personId}::${u.date}`)
      );

      const shiftsByCell = new Map<string, typeof ctx.shifts>();
      for (const s of ctx.shifts) {
        const key = `${s.personId}::${s.date}`;
        const arr = shiftsByCell.get(key) ?? [];
        arr.push(s);
        shiftsByCell.set(key, arr);
      }

      const toCreate: Array<{ personId: string; date: string }> = [];
      const toRemoveIds: string[] = [];
      const removedPreview: typeof ctx.shifts = [];
      let skippedLocked = 0;
      let skippedPto = 0;
      let skippedConflicts = 0;

      const simulated = [...ctx.shifts];

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        const key = `${cell.personId}::${cell.date}`;
        if (ptoSet.has(key)) {
          skippedPto++;
          continue;
        }

        const cellShifts = shiftsByCell.get(key) ?? [];
        const hasLocked = cellShifts.some((s) => s.isLocked);
        if (hasLocked && replaceExisting) {
          skippedLocked++;
          continue;
        }
        if (!replaceExisting) {
          if (cellShifts.some((s) => s.assignmentTypeId === assignmentTypeId)) continue;
          if (hasLocked && cellShifts.length > 0) {
            skippedLocked++;
            continue;
          }
        }

        const tempId = `batch-assign-${i}`;
        const candidate = {
          id: tempId,
          personId: cell.personId,
          assignmentTypeId,
          date: cell.date,
          customStartTime: null,
          customEndTime: null,
        };
        const { hardBlocks } = checkCandidateHardBlocks(
          new Set([tempId]),
          [...simulated, candidate],
          ctx
        );

        if (hardBlocks.length > 0) {
          if (conflictMode === 'ATOMIC_ROLLBACK') {
            res.status(400).json({
              error: hardBlocks[0].message,
              violations: hardBlocks,
            });
            return;
          }
          skippedConflicts++;
          continue;
        }

        if (replaceExisting) {
          for (const s of cellShifts) {
            if (!s.isLocked) {
              toRemoveIds.push(s.id);
              removedPreview.push(s);
            }
          }
        }
        toCreate.push(cell);
        simulated.push({
          ...candidate,
          status: PublishStatus.DRAFT,
          isLocked: false,
          note: null,
          publishedPairId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        if (toRemoveIds.length > 0) {
          await tx.shift.deleteMany({ where: { id: { in: toRemoveIds } } });
        }
        const created = [];
        for (const cell of toCreate) {
          const newShift = await tx.shift.create({
            data: {
              personId: cell.personId,
              assignmentTypeId,
              date: cell.date,
              status: PublishStatus.DRAFT,
              isLocked: false,
            },
          });
          created.push(newShift);
        }
        return {
          created,
          removed: removedPreview,
          skippedLocked,
          skippedPto,
          skippedConflicts,
        };
      });

      const unpublishedChangesCount = await getUnpublishedChangesCount();
      res.json({ ...result, unpublishedChangesCount });
      return;
    }

    if (action === 'lock') {
      const { isLocked, cells, shiftIds } = req.body as {
        isLocked: boolean;
        cells?: Array<{ personId: string; date: string }>;
        shiftIds?: string[];
      };

      let updatedCount = 0;
      if (Array.isArray(shiftIds) && shiftIds.length > 0) {
        const resUpdate = await prisma.shift.updateMany({
          where: { id: { in: shiftIds }, status: PublishStatus.DRAFT },
          data: { isLocked: Boolean(isLocked) },
        });
        updatedCount = resUpdate.count;
      } else if (Array.isArray(cells) && cells.length > 0) {
        const resUpdate = await prisma.shift.updateMany({
          where: {
            status: PublishStatus.DRAFT,
            OR: cells.map((c) => ({ personId: c.personId, date: c.date })),
          },
          data: { isLocked: Boolean(isLocked) },
        });
        updatedCount = resUpdate.count;
      }

      const unpublishedChangesCount = await getUnpublishedChangesCount();
      res.json({ updatedCount, unpublishedChangesCount });
      return;
    }

    if (action === 'paste') {
      const { items, targetCells } = req.body as {
        items: Array<{
          personId: string;
          date: string;
          assignmentTypeId: string;
          note?: string | null;
          customStartTime?: string | null;
          customEndTime?: string | null;
        }>;
        targetCells?: Array<{ personId: string; date: string }>;
      };

      if (!Array.isArray(items)) {
        res.status(400).json({ error: 'items array is required' });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        const allCells = targetCells && targetCells.length > 0 ? targetCells : items;
        const personIds = [...new Set(allCells.map((c) => c.personId))];
        const dates = [...new Set(allCells.map((c) => c.date))];

        const [existingShifts, existingUnavails] = await Promise.all([
          tx.shift.findMany({
            where: {
              status: PublishStatus.DRAFT,
              personId: { in: personIds },
              date: { in: dates },
            },
          }),
          tx.unavailability.findMany({
            where: {
              status: PublishStatus.DRAFT,
              personId: { in: personIds },
              date: { in: dates },
              timeBlock: TimeBlock.FULL_DAY,
            },
          }),
        ]);

        const ptoSet = new Set(existingUnavails.map((u) => `${u.personId}::${u.date}`));
        const lockedCellSet = new Set(
          existingShifts.filter((s) => s.isLocked).map((s) => `${s.personId}::${s.date}`)
        );

        const removed: typeof existingShifts = [];
        let skippedLocked = 0;

        // Clear unlocked shifts in target cells before pasting
        for (const cell of allCells) {
          const key = `${cell.personId}::${cell.date}`;
          if (lockedCellSet.has(key)) {
            skippedLocked++;
            continue;
          }
          const toRemove = existingShifts.filter(
            (s) => s.personId === cell.personId && s.date === cell.date && !s.isLocked
          );
          if (toRemove.length > 0) {
            removed.push(...toRemove);
            await tx.shift.deleteMany({ where: { id: { in: toRemove.map((r) => r.id) } } });
          }
        }

        const created: typeof existingShifts = [];
        let skippedPto = 0;

        for (const item of items) {
          const key = `${item.personId}::${item.date}`;
          if (lockedCellSet.has(key)) continue;
          if (ptoSet.has(key)) {
            skippedPto++;
            continue;
          }
          const s = await tx.shift.create({
            data: {
              personId: item.personId,
              assignmentTypeId: item.assignmentTypeId,
              date: item.date,
              status: PublishStatus.DRAFT,
              isLocked: false,
              note: item.note ?? null,
              customStartTime: item.customStartTime ?? null,
              customEndTime: item.customEndTime ?? null,
            },
          });
          created.push(s);
        }

        return { created, removed, skippedLocked, skippedPto };
      });

      const unpublishedChangesCount = await getUnpublishedChangesCount();
      res.json({ ...result, unpublishedChangesCount });
      return;
    }

    if (action === 'restore') {
      const { deleteIds = [], restoreShifts = [] } = req.body as {
        deleteIds?: string[];
        restoreShifts?: Array<{
          personId: string;
          assignmentTypeId: string;
          date: string;
          isLocked: boolean;
          note: string | null;
          customStartTime: string | null;
          customEndTime: string | null;
          publishedPairId: string | null;
        }>;
      };

      await prisma.$transaction(async (tx) => {
        if (deleteIds.length > 0) {
          await tx.shift.deleteMany({
            where: { id: { in: deleteIds }, status: PublishStatus.DRAFT },
          });
        }
        for (const s of restoreShifts) {
          await tx.shift.create({
            data: {
              personId: s.personId,
              assignmentTypeId: s.assignmentTypeId,
              date: s.date,
              status: PublishStatus.DRAFT,
              isLocked: s.isLocked,
              note: s.note,
              customStartTime: s.customStartTime,
              customEndTime: s.customEndTime,
              publishedPairId: s.publishedPairId,
            },
          });
        }
      });

      const unpublishedChangesCount = await getUnpublishedChangesCount();
      res.json({ success: true, unpublishedChangesCount });
      return;
    }

    res.status(400).json({ error: 'Unknown batch action' });
  } catch (err) {
    console.error('Batch schedule error:', err);
    res.status(500).json({ error: 'Batch operation failed' });
  }
});

// Batch Delete unlocked DRAFT shifts in selected cells
scheduleRouter.delete('/batch', requireAdmin, async (req, res) => {
  try {
    const { cells } = req.body as { cells: Array<{ personId: string; date: string }> };
    if (!Array.isArray(cells) || cells.length === 0) {
      res.status(400).json({ error: 'cells array is required' });
      return;
    }

    const existing = await prisma.shift.findMany({
      where: {
        status: PublishStatus.DRAFT,
        OR: cells.map((c) => ({ personId: c.personId, date: c.date })),
      },
    });

    const unlocked = existing.filter((s) => !s.isLocked);
    const lockedCount = existing.length - unlocked.length;

    if (unlocked.length > 0) {
      await prisma.shift.deleteMany({
        where: { id: { in: unlocked.map((s) => s.id) } },
      });
    }

    const unpublishedChangesCount = await getUnpublishedChangesCount();
    res.json({
      deletedShifts: unlocked,
      skippedLockedCount: lockedCount,
      unpublishedChangesCount,
    });
  } catch (err) {
    console.error('Batch delete error:', err);
    res.status(500).json({ error: 'Batch delete failed' });
  }
});

// Toggle or set Unavailability (PTO) as DRAFT
scheduleRouter.post('/unavailability/toggle', requireAdmin, async (req, res) => {
  try {
    const {
      cells,
      personId,
      date,
      timeBlock = TimeBlock.FULL_DAY,
      startTime,
      endTime,
      note,
    } = req.body ?? {};

    const targetCells: Array<{ personId: string; date: string }> = Array.isArray(cells)
      ? cells
      : personId && date
        ? [{ personId, date }]
        : [];

    if (targetCells.length === 0) {
      res.status(400).json({ error: 'personId/date or cells array required' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.unavailability.findMany({
        where: {
          status: PublishStatus.DRAFT,
          OR: targetCells.map((c) => ({ personId: c.personId, date: c.date })),
        },
      });

      const existingMap = new Map(existing.map((u) => [`${u.personId}::${u.date}`, u]));

      // If all target cells already have unavailability, toggle them OFF; otherwise set them ON
      const allHave = targetCells.every((c) => existingMap.has(`${c.personId}::${c.date}`));

      if (allHave) {
        await tx.unavailability.deleteMany({
          where: { id: { in: existing.map((u) => u.id) } },
        });
        return { action: 'removed', count: existing.length };
      } else {
        let added = 0;
        for (const c of targetCells) {
          const key = `${c.personId}::${c.date}`;
          const prev = existingMap.get(key);
          if (!prev) {
            await tx.unavailability.create({
              data: {
                personId: c.personId,
                date: c.date,
                timeBlock: timeBlock as TimeBlock,
                startTime: startTime || null,
                endTime: endTime || null,
                note: typeof note === 'string' && note.trim() ? note.trim() : null,
                status: PublishStatus.DRAFT,
              },
            });
            added++;
          } else if (note !== undefined || timeBlock !== prev.timeBlock) {
            await tx.unavailability.update({
              where: { id: prev.id },
              data: {
                timeBlock: timeBlock as TimeBlock,
                startTime: startTime || null,
                endTime: endTime || null,
                note: typeof note === 'string' && note.trim() ? note.trim() : null,
              },
            });
          }
        }
        return { action: 'added', count: added };
      }
    });

    const unpublishedChangesCount = await getUnpublishedChangesCount();
    res.json({ ...result, unpublishedChangesCount });
  } catch (err) {
    console.error('Toggle unavailability error:', err);
    res.status(500).json({ error: 'Failed to toggle unavailability' });
  }
});

scheduleRouter.delete('/unavailability/:id', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.unavailability.findUnique({ where: { id } });
    if (!existing || existing.status !== PublishStatus.DRAFT) {
      res.status(404).json({ error: 'Draft unavailability not found' });
      return;
    }
    await prisma.unavailability.delete({ where: { id } });
    const unpublishedChangesCount = await getUnpublishedChangesCount();
    res.json({ success: true, unpublishedChangesCount });
  } catch (err) {
    console.error('Delete unavailability error:', err);
    res.status(500).json({ error: 'Failed to delete unavailability' });
  }
});

// Admin Auto-Scheduler Solver (Preview & Apply)
scheduleRouter.post('/auto-generate', requireAdmin, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      personIds,
      categoryIds,
      assignmentTypeIds,
      mode = 'FILL_GAPS',
      apply = false,
    } = req.body ?? {};

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate are required' });
      return;
    }

    const result = await runAutoScheduler({
      startDate,
      endDate,
      personIds,
      categoryIds,
      assignmentTypeIds,
      mode,
      apply: Boolean(apply),
    });

    res.json(result);
  } catch (err) {
    console.error('Auto-generate error:', err);
    res.status(500).json({ error: 'Auto-scheduler failed' });
  }
});

