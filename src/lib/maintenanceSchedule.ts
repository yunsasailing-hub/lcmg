import type { Database } from '@/integrations/supabase/types';

export type Frequency = Database['public']['Enums']['maintenance_schedule_frequency'];

export function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Given a date and frequency, return the next scheduled occurrence strictly after `from`. */
export function nextOccurrenceAfter(from: Date, frequency: Frequency, customDays: number | null): Date | null {
  switch (frequency) {
    case 'daily':
      return addDays(from, 1);
    case 'weekly':
      return addDays(from, 7);
    case 'monthly': {
      const day = from.getDate();
      // Move to first of next month, then clamp to original day or month-end.
      const base = new Date(from.getFullYear(), from.getMonth() + 1, 1);
      const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
      base.setDate(Math.min(day, lastDay));
      return base;
    }
    case 'every_90_days':
      return addDays(from, 90);
    case 'custom_interval':
      if (!customDays || customDays <= 0) return null;
      return addDays(from, customDays);
    default:
      return null;
  }
}

/**
 * Compute the first scheduled occurrence date (>= today's anchor) for a recurring schedule.
 * - If lastExecution is provided, the first occurrence is `nextOccurrenceAfter(lastExecution)`.
 * - Otherwise the first occurrence is the schedule's `createdAt` date itself.
 * Subsequent occurrences are obtained by walking nextOccurrenceAfter from that point.
 */
export function firstScheduledOccurrence(
  frequency: Frequency,
  customDays: number | null,
  createdAt: Date,
  lastExecution: Date | null,
): Date | null {
  if (lastExecution) return nextOccurrenceAfter(startOfDay(lastExecution), frequency, customDays);
  return startOfDay(createdAt);
}

/** Walk occurrences forward and collect those whose date (YYYY-MM-DD) falls within [fromISO, toISO]. */
export function occurrencesInRange(
  frequency: Frequency,
  customDays: number | null,
  createdAt: Date,
  lastExecution: Date | null,
  fromISO: string,
  toISO: string,
): string[] {
  const out: string[] = [];
  let cur = firstScheduledOccurrence(frequency, customDays, createdAt, lastExecution);
  if (!cur) return out;
  // Safety cap to avoid runaway loops on bad config.
  for (let i = 0; i < 400; i++) {
    const iso = localISO(cur);
    if (iso > toISO) break;
    if (iso >= fromISO) out.push(iso);
    const nxt = nextOccurrenceAfter(cur, frequency, customDays);
    if (!nxt) break;
    cur = nxt;
  }
  return out;
}

/** Compute the next due date >= today (or null). */
export function nextDueDate(
  frequency: Frequency,
  customDays: number | null,
  createdAt: Date,
  lastExecution: Date | null,
  today: Date,
): Date | null {
  let cur = firstScheduledOccurrence(frequency, customDays, createdAt, lastExecution);
  if (!cur) return null;
  const todayStart = startOfDay(today);
  for (let i = 0; i < 1000; i++) {
    if (cur.getTime() >= todayStart.getTime()) return cur;
    const nxt = nextOccurrenceAfter(cur, frequency, customDays);
    if (!nxt) return null;
    cur = nxt;
  }
  return null;
}