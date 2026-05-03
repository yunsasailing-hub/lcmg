/**
 * Centralized user display formatter for OPERATIONAL views.
 *
 * Always shows the username. If a username is missing, shows the warning fallback.
 * NEVER falls back to full_name or email in operational contexts.
 */
export const NO_USERNAME_FALLBACK = '⚠️ no username';

export function userHandle(u?: { username?: string | null } | null): string {
  const v = (u?.username || '').trim();
  return v ? v : NO_USERNAME_FALLBACK;
}

/** With leading @ when a username exists; otherwise the warning. */
export function userHandleAt(u?: { username?: string | null } | null): string {
  const v = (u?.username || '').trim();
  return v ? `@${v}` : NO_USERNAME_FALLBACK;
}