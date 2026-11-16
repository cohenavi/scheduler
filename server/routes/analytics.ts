import { PublishStatus } from '@prisma/client';
import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { evaluateSchedule, getDayOfWeekFromYMD, getShiftInterval, getUnavailInterval } from '../constraintEngine.js';
import { loadScheduleContext } from '../constraintHelper.js';
import { prisma } from '../db.js';

export const analyticsRouter = Router();

analyticsRouter.use(requireAdmin);

function enumerateDates(startYMD: string, endYMD: string): string[] {
  const [sy, sm, sd] = startYMD.split('-').map(Number);
  const [ey, em, ed] = endYMD.split('-').map(Number);
  const cur = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  const dates: string[] = [];
  while (cur <= end) {
    dates.push(
      `${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}-${String(
        cur.getUTCDate()
      ).padStart(2, '0')}`
    );
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

analyticsRouter.get('/', async (req, res) => {
  try {
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : '';
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : '';
    const viewMode = req.query.viewMode === 'PUBLISHED' ? PublishStatus.PUBLISHED : PublishStatus.DRAFT;

    const [ctx, categories] = await Promise.all([
      loadScheduleContext(viewMode),
      prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);

    const atMap = new Map(ctx.assignmentTypes.map((a) => [a.id, a]));
    const rangeShifts =
      startDate && endDate
        ? ctx.shifts.filter((s) => s.date >= startDate && s.date <= endDate)
        : ctx.shifts;
    const rangeUnavails =
      startDate && endDate
        ? ctx.unavailabilities.filter((u) => u.date >= startDate && u.date <= endDate)
        : ctx.unavailabilities;

    const { violations } = evaluateSchedule(
      ctx.shifts,
      ctx.unavailabilities,
      ctx.people,
      ctx.assignmentTypes,
      ctx.rules
    );
    const rangeViolations =
      startDate && endDate
        ? violations.filter((v) => v.date >= startDate && v.date <= endDate)
        : violations;

    // Coverage rate
    let requiredSlots = 0;
    if (startDate && endDate) {
      for (const d of enumerateDates(startDate, endDate)) {
        const dow = getDayOfWeekFromYMD(d);
        for (const at of ctx.assignmentTypes) {
          if (at.allowedDaysOfWeek.includes(dow)) {
            requiredSlots += at.requiredStaffPerDay ?? 1;
          }
        }
      }
    }
    const coverageRate =
      requiredSlots > 0 ? Math.min(100, Math.round((rangeShifts.length / requiredSlots) * 100)) : 100;

    // Category totals
    const categoryTotalsMap = new Map(
      categories.map((c) => [c.id, { categoryId: c.id, name: c.name, shifts: 0, hours: 0 }])
    );

    let totalHours = 0;
    for (const s of rangeShifts) {
      const at = atMap.get(s.assignmentTypeId);
      if (!at) continue;
      const { hours } = getShiftInterval(s, at);
      totalHours += hours;
      const catEntry = categoryTotalsMap.get(at.categoryId);
      if (catEntry) {
        catEntry.shifts += 1;
        catEntry.hours = Math.round((catEntry.hours + hours) * 10) / 10;
      }
    }

    // PTO hours
    let ptoHours = 0;
    for (const u of rangeUnavails) {
      const { startMs, endMs } = getUnavailInterval(u);
      ptoHours += Math.round(((endMs - startMs) / 3_600_000) * 10) / 10;
    }

    // Per-person breakdown
    const personStatsRaw = ctx.people.map((p) => {
      const pShifts = rangeShifts.filter((s) => s.personId === p.id);
      const pUnavails = rangeUnavails.filter((u) => u.personId === p.id);
      const byCategory: Record<string, { shifts: number; hours: number }> = {};
      for (const c of categories) {
        byCategory[c.id] = { shifts: 0, hours: 0 };
      }
      let pHours = 0;
      for (const s of pShifts) {
        const at = atMap.get(s.assignmentTypeId);
        if (!at) continue;
        const { hours } = getShiftInterval(s, at);
        pHours += hours;
        if (byCategory[at.categoryId]) {
          byCategory[at.categoryId].shifts += 1;
          byCategory[at.categoryId].hours =
            Math.round((byCategory[at.categoryId].hours + hours) * 10) / 10;
        }
      }
      return {
        personId: p.id,
        name: p.name,
        role: p.role,
        totalShifts: pShifts.length,
        totalHours: Math.round(pHours * 10) / 10,
        ptoCount: pUnavails.length,
        byCategory,
      };
    });

    const avgPersonHours =
      personStatsRaw.length > 0
        ? personStatsRaw.reduce((acc, p) => acc + p.totalHours, 0) / personStatsRaw.length
        : 0;

    const personStats = personStatsRaw.map((p) => ({
      ...p,
      varianceFromAvgHours: Math.round((p.totalHours - avgPersonHours) * 10) / 10,
    }));

    res.json({
      viewMode,
      kpis: {
        totalShifts: rangeShifts.length,
        totalHours: Math.round(totalHours * 10) / 10,
        conflictCount: rangeViolations.length,
        ptoCount: rangeUnavails.length,
        ptoHours: Math.round(ptoHours * 10) / 10,
        coverageRate,
        requiredSlots,
        avgPersonHours: Math.round(avgPersonHours * 10) / 10,
      },
      categoryTotals: Array.from(categoryTotalsMap.values()),
      personStats,
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to compute analytics' });
  }
});
