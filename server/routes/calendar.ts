import { PublishStatus } from '@prisma/client';
import { Router } from 'express';
import { prisma } from '../db.js';

export const calendarRouter = Router();

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let offset = 0;
  let first = true;
  while (offset < line.length) {
    const chunkLen = first ? 75 : 74;
    parts.push((first ? '' : ' ') + line.slice(offset, offset + chunkLen));
    offset += chunkLen;
    first = false;
  }
  return parts.join('\r\n');
}

function addOneDayYMD(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate()
  ).padStart(2, '0')}`;
}

function toIcsLocalDateTime(ymd: string, hhmm: string): string {
  const datePart = ymd.replace(/-/g, '');
  const [h, m] = hhmm.split(':');
  return `${datePart}T${String(h || '00').padStart(2, '0')}${String(m || '00').padStart(2, '0')}00`;
}

function toIcsUtcTimestamp(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

calendarRouter.get('/link/:personId', async (req, res) => {
  try {
    const personId = String(req.params.personId);
    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, name: true, calendarToken: true },
    });
    if (!person) {
      res.status(404).json({ error: 'Person not found' });
      return;
    }
    res.json({ personId: person.id, name: person.name, calendarToken: person.calendarToken });
  } catch (err) {
    console.error('Calendar link lookup error:', err);
    res.status(500).json({ error: 'Failed to look up calendar link' });
  }
});

calendarRouter.get('/:tokenFile', async (req, res) => {
  try {
    const raw = String(req.params.tokenFile);
    const token = raw.endsWith('.ics') ? raw.slice(0, -4) : raw;
    if (!token) {
      res.status(404).send('Calendar not found');
      return;
    }

    const person = await prisma.person.findUnique({
      where: { calendarToken: token },
    });

    if (!person) {
      res.status(404).send('Calendar not found');
      return;
    }

    const shifts = await prisma.shift.findMany({
      where: {
        personId: person.id,
        status: PublishStatus.PUBLISHED,
      },
      include: {
        assignmentType: {
          include: {
            category: true,
          },
        },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    const tz = process.env.TZ || 'America/Detroit';
    const nowStamp = toIcsUtcTimestamp(new Date());

    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Team Scheduler//Shift Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      foldIcsLine(`X-WR-CALNAME:${escapeIcsText(person.name)} - Shift Schedule`),
      foldIcsLine(`X-WR-TIMEZONE:${tz}`),
    ];

    for (const shift of shifts) {
      const at = shift.assignmentType;
      const cat = at.category;
      const startTime = shift.customStartTime || at.startTime;
      const endTime = shift.customEndTime || at.endTime;
      const isOvernight = endTime <= startTime;
      const endYMD = isOvernight ? addOneDayYMD(shift.date) : shift.date;

      const dtStart = toIcsLocalDateTime(shift.date, startTime);
      const dtEnd = toIcsLocalDateTime(endYMD, endTime);
      const lastMod = toIcsUtcTimestamp(shift.updatedAt);

      const summary = `[${at.shortCode}] ${at.name} (${cat.name})`;
      const descParts: string[] = [];
      if (shift.note && shift.note.trim()) {
        descParts.push(`Note: ${shift.note.trim()}`);
      }
      descParts.push(`Time Block: ${at.timeBlockLabel} (${startTime}–${endTime})`);
      descParts.push(`Category: ${cat.name}`);
      const description = descParts.join('\n');

      lines.push('BEGIN:VEVENT');
      lines.push(foldIcsLine(`UID:shift-${shift.id}@scheduler`));
      lines.push(`DTSTAMP:${nowStamp}`);
      lines.push(`LAST-MODIFIED:${lastMod}`);
      lines.push(foldIcsLine(`DTSTART;TZID=${tz}:${dtStart}`));
      lines.push(foldIcsLine(`DTEND;TZID=${tz}:${dtEnd}`));
      lines.push(foldIcsLine(`SUMMARY:${escapeIcsText(summary)}`));
      lines.push(foldIcsLine(`DESCRIPTION:${escapeIcsText(description)}`));
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.setHeader('Content-Disposition', `inline; filename="${person.id}.ics"`);
    res.send(lines.join('\r\n') + '\r\n');
  } catch (err) {
    console.error('ICS calendar feed error:', err);
    res.status(500).send('Failed to generate calendar feed');
  }
});
