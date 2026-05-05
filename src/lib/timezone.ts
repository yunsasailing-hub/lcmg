// Vietnam timezone helpers (Asia/Ho_Chi_Minh, UTC+7, no DST)
export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const VN_OFFSET_HOURS = 7;

/**
 * Convert a local Vietnam date+time to a UTC ISO string for storage.
 * Example: ('2025-04-17', '10:00:00') -> '2025-04-17T03:00:00.000Z'
 */
export function vnLocalToUtcISO(dateStr: string, timeStr: string): string {
  // Normalize time to HH:MM:SS
  const [h, m, s] = timeStr.split(':');
  const hh = (h ?? '00').padStart(2, '0');
  const mm = (m ?? '00').padStart(2, '0');
  const ss = (s ?? '00').padStart(2, '0');
  // +07:00 offset means the wall-clock time is in Vietnam
  return new Date(`${dateStr}T${hh}:${mm}:${ss}+07:00`).toISOString();
}

/** Format a UTC/ISO timestamp as Vietnam local time. */
export function formatVN(
  iso: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false }
): string {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-GB', { timeZone: VN_TIMEZONE, ...opts }).format(d);
}

/** Format a UTC/ISO timestamp as 'MMM d, yyyy · HH:mm' Vietnam local time. */
export function formatVNDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const datePart = new Intl.DateTimeFormat('en-US', {
    timeZone: VN_TIMEZONE, month: 'short', day: 'numeric', year: 'numeric',
  }).format(d);
  const timePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
  return `${datePart} · ${timePart}`;
}

/** Today's date (yyyy-MM-dd) in Vietnam time. */
export function todayVN(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VN_TIMEZONE, year: 'numeric', month: '2-digit', day: 'numeric',
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

/** Format a date or ISO timestamp as DD/MM/YYYY in Vietnam time.
 *  Accepts plain YYYY-MM-DD strings (no timezone shift) and full ISO timestamps. */
export function formatVNDateDMY(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00+07:00`)
      : typeof value === 'string'
        ? new Date(value)
        : value;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TIMEZONE, day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(d);
}

/** Format only the HH:mm part of an ISO timestamp in Vietnam time. */
export function formatVNTimeHM(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}
