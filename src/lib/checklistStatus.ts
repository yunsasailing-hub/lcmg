/**
 * PATCH 3 — Unified checklist timing logic.
 *
 * Single source of truth for "is this checklist overdue / notice / warning?"
 * Used by Dashboard cards, Checklist module cards, and any UI that needs to
 * label a pending checklist. The backend notification trigger
 * (supabase/functions/generate-checklist-notifications) uses the same
 * thresholds (notice_delay_hours / warning_delay_hours from
 * notification_settings, defaults 2 / 4) so UI and notifications stay aligned.
 *
 * Time math is timezone-agnostic: both `now` and `due_datetime` are absolute
 * instants (UTC ISO strings), so `Date.getTime()` differences are correct in
 * any local timezone (incl. Vietnam, UTC+7).
 */

export const DEFAULT_NOTICE_HOURS = 2;
export const DEFAULT_WARNING_HOURS = 4;

export type ChecklistStatusInput = {
  due_datetime?: string | null;
  scheduled_date?: string | null;
  status?: string | null;
};

export type ChecklistStatusResult = {
  isOverdue: boolean;
  isNotice: boolean;
  isWarning: boolean;
  /** UI label: "Overdue" if overdue, otherwise "Pending". */
  label: 'Overdue' | 'Pending';
};

export function getChecklistStatus(
  item: ChecklistStatusInput,
  opts: { noticeHours?: number; warningHours?: number; now?: Date } = {},
): ChecklistStatusResult {
  const now = opts.now ?? new Date();
  const noticeHours = opts.noticeHours ?? DEFAULT_NOTICE_HOURS;
  const warningHours = opts.warningHours ?? DEFAULT_WARNING_HOURS;

  // Prefer explicit due_datetime; otherwise fall back to end-of-day on the
  // scheduled_date (Vietnam local 23:59 ≈ start of next day UTC).
  let due: Date | null = null;
  if (item.due_datetime) {
    due = new Date(item.due_datetime);
  } else if (item.scheduled_date) {
    // Treat as 23:59 local Vietnam time
    due = new Date(`${item.scheduled_date}T23:59:00+07:00`);
  }

  // Backend already escalates status; honour it as a hard signal.
  const dbOverdue = item.status === 'late' || item.status === 'escalated';

  if (!due) {
    return {
      isOverdue: dbOverdue,
      isNotice: dbOverdue,
      isWarning: item.status === 'escalated',
      label: dbOverdue ? 'Overdue' : 'Pending',
    };
  }

  const noticeAt = new Date(due.getTime() + noticeHours * 3600_000);
  const warningAt = new Date(due.getTime() + warningHours * 3600_000);

  const isOverdue = dbOverdue || now >= due;
  const isNotice = now >= noticeAt;
  const isWarning = now >= warningAt;

  return {
    isOverdue,
    isNotice,
    isWarning,
    label: isOverdue ? 'Overdue' : 'Pending',
  };
}