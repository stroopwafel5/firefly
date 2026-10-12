import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * EVENTS_UPLOAD_PASSCODE holds one passcode, or several for several admins, each with a name
 * that is saved with what they upload:
 *
 *   EVENTS_UPLOAD_PASSCODE=anna:sunny-river-4821, david:green-hill-7710
 *
 * Passcodes shorter than 8 characters, and the "unset" placeholder, are ignored (the page then
 * says uploads are switched off).
 */
export function readPasscodes(value: string): Array<{ name: string; code: string }> {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf(':');
      return i > 0 ? { name: s.slice(0, i).trim(), code: s.slice(i + 1).trim() } : { name: 'admin', code: s };
    })
    .filter((p) => p.code.length >= 8 && p.code !== 'unset');
}

const digest = (s: string) => createHash('sha256').update(s, 'utf8').digest();

/** The admin's name for a correct passcode, else null (constant-time comparison). */
export function checkPasscode(value: string, given: unknown): string | null {
  if (typeof given !== 'string' || !given.trim()) return null;
  const g = digest(given.trim());
  let who: string | null = null;
  for (const p of readPasscodes(value)) if (timingSafeEqual(digest(p.code), g)) who = p.name;
  return who;
}

/** Wrong passcodes allowed per address before a 15-minute lock. */
export const MAX_FAILS = 8;
export const LOCK_MS = 15 * 60_000;

export interface GuardState {
  fails: number;
  firstAt: number;
  lockedUntil: number;
}

/** After a wrong passcode: count it; the 8th within 15 minutes locks the address for 15 minutes. */
export function afterFailure(s: GuardState | undefined, now: number): GuardState {
  const fresh = !s || now - s.firstAt > LOCK_MS;
  const fails = fresh ? 1 : s.fails + 1;
  return { fails, firstAt: fresh ? now : s.firstAt, lockedUntil: fails >= MAX_FAILS ? now + LOCK_MS : s?.lockedUntil ?? 0 };
}
