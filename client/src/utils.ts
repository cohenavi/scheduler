import type { AssignmentType, Shift } from './types';

export function formatDateYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseYMD(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function getMondayOfWeek(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + diff);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function getDaysArray(startDate: Date, count: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(formatDateYMD(addDays(startDate, i)));
  }
  return result;
}

export function formatDayHeader(ymd: string): { dow: string; monthDay: string; isWeekend: boolean; dayOfWeek: number } {
  const d = parseYMD(ymd);
  const dow = d.toLocaleDateString('en-US', { weekday: 'short' });
  const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const dayOfWeek = d.getDay();
  return {
    dow,
    monthDay,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    dayOfWeek,
  };
}

export function formatLongDate(ymd: string): string {
  return parseYMD(ymd).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getContrastTextColor(hexColor: string): string {
  const clean = hexColor.replace('#', '');
  if (clean.length !== 6) return '#FFFFFF';
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.42 ? '#0F172A' : '#FFFFFF';
}

export function calculateHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (Number.isNaN(sh) || Number.isNaN(eh)) return 8;
  let startMin = sh * 60 + (sm || 0);
  let endMin = eh * 60 + (em || 0);
  if (endMin <= startMin) {
    endMin += 24 * 60; // overnight span
  }
  return Math.round(((endMin - startMin) / 60) * 10) / 10;
}

export function getShiftHours(shift: Shift, assignmentMap: Map<string, AssignmentType>): number {
  const at = assignmentMap.get(shift.assignmentTypeId);
  const start = shift.customStartTime || at?.startTime || '08:00';
  const end = shift.customEndTime || at?.endTime || '17:00';
  return calculateHours(start, end);
}

export function compareShiftsByTime(a: Shift, b: Shift, assignmentMap: Map<string, AssignmentType>): number {
  const atA = assignmentMap.get(a.assignmentTypeId);
  const atB = assignmentMap.get(b.assignmentTypeId);
  const startA = a.customStartTime || atA?.startTime || '00:00';
  const startB = b.customStartTime || atB?.startTime || '00:00';
  if (startA !== startB) return startA.localeCompare(startB);
  return (atA?.sortOrder ?? 0) - (atB?.sortOrder ?? 0);
}

const HONORIFICS = new Set(['dr', 'dr.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'prof', 'prof.']);

export function getPersonInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0 && !HONORIFICS.has(p.toLowerCase()));
  if (parts.length === 0) return name.trim().slice(0, 2).toUpperCase() || '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function buildInitialsMap(people: Array<{ id: string; name: string }>): Map<string, string> {
  const raw = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const p of people) {
    const ini = getPersonInitials(p.name);
    raw.set(p.id, ini);
    counts.set(ini, (counts.get(ini) ?? 0) + 1);
  }

  const result = new Map<string, string>();
  for (const p of people) {
    const ini = raw.get(p.id) ?? '?';
    if ((counts.get(ini) ?? 0) <= 1) {
      result.set(p.id, ini);
    } else {
      const parts = p.name
        .trim()
        .split(/\s+/)
        .filter((part) => part.length > 0 && !HONORIFICS.has(part.toLowerCase()));
      const last = parts[parts.length - 1] ?? '';
      const disambig = last.length >= 2 ? `${ini}${last[1].toLowerCase()}` : ini;
      result.set(p.id, disambig);
    }
  }
  return result;
}

