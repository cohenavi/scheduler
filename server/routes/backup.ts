import { spawn } from 'node:child_process';
import zlib from 'node:zlib';
import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { prisma } from '../db.js';

export const backupRouter = Router();

backupRouter.use(requireAdmin);

function formatBackupTimestamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}-${hh}${mm}`;
}

backupRouter.get('/backup', async (req, res) => {
  const format = String(req.query.format || 'json').toLowerCase();
  const ts = formatBackupTimestamp();

  if (format === 'sql') {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      res.status(500).json({ error: 'DATABASE_URL is not configured' });
      return;
    }

    // pg_dump does not accept Prisma's ?schema=public query parameter
    const cleanDbUrl = dbUrl
      .replace(/([?&])schema=[^&]*&?/g, '$1')
      .replace(/[?&]$/, '');

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="scheduler-backup-${ts}.sql.gz"`);

    const dump = spawn('pg_dump', ['--clean', '--if-exists', cleanDbUrl], {
      env: process.env,
    });
    const gzip = zlib.createGzip();

    let stderr = '';
    dump.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    dump.on('error', (err) => {
      console.error('pg_dump spawn error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'pg_dump failed to start' });
      }
    });

    dump.on('close', (code) => {
      if (code !== 0) {
        console.error('pg_dump exited with code', code, stderr);
      }
    });

    dump.stdout.pipe(gzip).pipe(res);
    return;
  }

  // JSON Snapshot
  try {
    const [
      categories,
      assignmentTypes,
      peopleRaw,
      constraintRules,
      scheduleTemplates,
      shifts,
      unavailabilities,
      appSettings,
    ] = await Promise.all([
      prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.assignmentType.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.person.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { allowedAssignments: { select: { id: true } } },
      }),
      prisma.constraintRule.findMany({ orderBy: { priority: 'asc' } }),
      prisma.scheduleTemplate.findMany({ include: { entries: true } }),
      prisma.shift.findMany(),
      prisma.unavailability.findMany(),
      prisma.appSetting.findMany(),
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

    const bundle = {
      version: 1,
      exportedAt: new Date().toISOString(),
      counts: {
        people: people.length,
        categories: categories.length,
        assignmentTypes: assignmentTypes.length,
        constraintRules: constraintRules.length,
        scheduleTemplates: scheduleTemplates.length,
        shifts: shifts.length,
        unavailabilities: unavailabilities.length,
      },
      data: {
        categories,
        assignmentTypes,
        people,
        constraintRules,
        scheduleTemplates,
        shifts,
        unavailabilities,
        appSettings,
      },
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="scheduler-backup-${ts}.json"`);
    res.send(JSON.stringify(bundle, null, 2));
  } catch (err) {
    console.error('JSON backup error:', err);
    res.status(500).json({ error: 'Failed to export JSON backup' });
  }
});

backupRouter.post('/restore', async (req, res) => {
  try {
    const bundle = req.body;
    if (!bundle || bundle.version !== 1 || !bundle.data) {
      res.status(400).json({ error: 'Invalid backup JSON format' });
      return;
    }

    const {
      categories = [],
      assignmentTypes = [],
      people = [],
      constraintRules = [],
      scheduleTemplates = [],
      shifts = [],
      unavailabilities = [],
      appSettings = [],
    } = bundle.data;

    await prisma.$transaction(async (tx) => {
      // Clear tables in dependency order
      await tx.templateEntry.deleteMany();
      await tx.scheduleTemplate.deleteMany();
      await tx.constraintRule.deleteMany();
      await tx.shift.deleteMany();
      await tx.unavailability.deleteMany();
      await tx.person.deleteMany();
      await tx.assignmentType.deleteMany();
      await tx.category.deleteMany();
      await tx.appSetting.deleteMany();

      for (const c of categories) {
        await tx.category.create({
          data: { id: c.id, name: c.name, sortOrder: c.sortOrder ?? 0 },
        });
      }

      for (const at of assignmentTypes) {
        await tx.assignmentType.create({
          data: {
            id: at.id,
            categoryId: at.categoryId,
            name: at.name,
            shortCode: at.shortCode,
            colorHex: at.colorHex,
            allowedDaysOfWeek: at.allowedDaysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
            requiredStaffPerDay: at.requiredStaffPerDay ?? 1,
            timeBlockLabel: at.timeBlockLabel ?? 'Full Day',
            startTime: at.startTime ?? '08:00',
            endTime: at.endTime ?? '17:00',
            shortcutKey: at.shortcutKey ?? null,
            sortOrder: at.sortOrder ?? 0,
          },
        });
      }

      for (const p of people) {
        await tx.person.create({
          data: {
            id: p.id,
            name: p.name,
            role: p.role,
            calendarToken: p.calendarToken,
            maxShiftsPerWeek: p.maxShiftsPerWeek ?? null,
            maxHoursPerWeek: p.maxHoursPerWeek ?? null,
            sortOrder: p.sortOrder ?? 0,
            ...(Array.isArray(p.allowedAssignmentIds) && p.allowedAssignmentIds.length > 0
              ? {
                  allowedAssignments: {
                    connect: p.allowedAssignmentIds.map((aid: string) => ({ id: aid })),
                  },
                }
              : {}),
          },
        });
      }

      for (const r of constraintRules) {
        await tx.constraintRule.create({
          data: {
            id: r.id,
            name: r.name,
            ruleType: r.ruleType,
            enforcement: r.enforcement ?? 'SOFT_WARN',
            assignmentTypeId: r.assignmentTypeId ?? null,
            personId: r.personId ?? null,
            config: r.config ?? {},
            isActive: r.isActive ?? true,
            priority: r.priority ?? 0,
          },
        });
      }

      for (const tpl of scheduleTemplates) {
        await tx.scheduleTemplate.create({
          data: {
            id: tpl.id,
            name: tpl.name,
            description: tpl.description ?? null,
            cycleWeeks: tpl.cycleWeeks ?? 1,
            entries: {
              create: (tpl.entries ?? []).map((e: Record<string, unknown>) => ({
                id: typeof e.id === 'string' ? e.id : undefined,
                weekIndex: Number(e.weekIndex ?? 0),
                dayOfWeek: Number(e.dayOfWeek ?? 0),
                personId: typeof e.personId === 'string' ? e.personId : null,
                assignmentTypeId: String(e.assignmentTypeId),
                note: typeof e.note === 'string' ? e.note : null,
                customStartTime: typeof e.customStartTime === 'string' ? e.customStartTime : null,
                customEndTime: typeof e.customEndTime === 'string' ? e.customEndTime : null,
              })),
            },
          },
        });
      }

      for (const s of shifts) {
        await tx.shift.create({
          data: {
            id: s.id,
            personId: s.personId,
            assignmentTypeId: s.assignmentTypeId,
            date: s.date,
            status: s.status,
            isLocked: Boolean(s.isLocked),
            note: s.note ?? null,
            customStartTime: s.customStartTime ?? null,
            customEndTime: s.customEndTime ?? null,
            publishedPairId: s.publishedPairId ?? null,
          },
        });
      }

      for (const u of unavailabilities) {
        await tx.unavailability.create({
          data: {
            id: u.id,
            personId: u.personId,
            date: u.date,
            timeBlock: u.timeBlock,
            startTime: u.startTime ?? null,
            endTime: u.endTime ?? null,
            note: u.note ?? null,
            status: u.status,
            publishedPairId: u.publishedPairId ?? null,
          },
        });
      }

      for (const st of appSettings) {
        await tx.appSetting.create({
          data: { key: st.key, value: st.value },
        });
      }
    });

    res.json({ success: true, restoredCounts: bundle.counts });
  } catch (err) {
    console.error('Restore error:', err);
    res.status(500).json({ error: 'Failed to restore backup' });
  }
});

// Reset all schedule/roster/assignment data to start from scratch (preserves admin password in appSetting)
backupRouter.post('/reset', async (_req, res) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.templateEntry.deleteMany();
      await tx.scheduleTemplate.deleteMany();
      await tx.constraintRule.deleteMany();
      await tx.shift.deleteMany();
      await tx.unavailability.deleteMany();
      await tx.person.deleteMany();
      await tx.assignmentType.deleteMany();
      await tx.category.deleteMany();
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Database reset error:', err);
    res.status(500).json({ error: 'Failed to reset database' });
  }
});

