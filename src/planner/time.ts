import type { Time, WeeklyHours } from '../models';

/** "HH:MM" → minutes after midnight. Hours ≥ 24 are allowed ("25:00" = 1:00 the next morning). */
export function toMinutes(t: Time): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) throw new Error(`Bad time "${t}"`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutes after midnight → "HH:MM" without wrapping (1500 → "25:00"); use formatClock to display. */
export function fromMinutes(min: number): Time {
  const v = Math.round(min);
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

/** Slider range for the daily schedule: 07:00 to 01:00 the next day. */
export const DAY_MIN = 7 * 60;
export const DAY_MAX = 25 * 60;
export const DEFAULT_DAY_START = 8 * 60;
export const DEFAULT_DAY_END = 20 * 60;

/**
 * Converts provider "periods" to WeeklyHours (index 0 = Sunday).
 * Accepts both conventions seen in the wild: 0–6 with 0 = Sunday (Google style) and 1–7 with
 * 7 = Sunday (ISO). Times are "HHMM" strings. Close times earlier than open mean "after midnight".
 */
export function periodsToWeekly(
  periods: Array<{ open?: { day: number; time: string }; close?: { day: number; time: string } }> | undefined,
): WeeklyHours | undefined {
  if (!periods?.length) return undefined;
  const iso = periods.some((p) => p.open?.day === 7 || p.close?.day === 7);
  const week: WeeklyHours = [[], [], [], [], [], [], []];
  const hhmm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(2, 4));
  for (const p of periods) {
    if (!p.open) continue;
    const day = iso ? p.open.day % 7 : p.open.day;
    if (day < 0 || day > 6) continue;
    const open = hhmm(p.open.time);
    if (!p.close) {
      // Open 24 hours.
      week[day].push({ open: 0, close: 1440 });
      continue;
    }
    let close = hhmm(p.close.time);
    const closeDay = iso ? p.close.day % 7 : p.close.day;
    if (closeDay !== day || close <= open) close += 1440;
    week[day].push({ open, close });
  }
  return week;
}

/** Flattens a day's intervals to the spec's Time[] ([open, close, open, close…]). */
export function weeklyToTimes(week: WeeklyHours | undefined, weekday = 3): Time[] {
  if (!week) return [];
  return week[weekday].flatMap((i) => [fromMinutes(i.open), fromMinutes(i.close)]);
}

export type OpenCheck = 'open' | 'closed' | 'closedDay' | 'unknown';

/**
 * Is the place open for the whole [start, end) window on this date?
 * Unknown hours are treated as open (and reported as 'unknown' so the UI can say so).
 * Windows past midnight are checked against the previous day's late intervals too.
 */
export function checkOpen(week: WeeklyHours | undefined, date: Date, start: number, end: number): OpenCheck {
  if (!week) return 'unknown';
  const day = date.getDay();
  const today = week[day];
  const prev = week[(day + 6) % 7].map((i) => ({ open: i.open - 1440, close: i.close - 1440 }));
  if (!today.length && !prev.some((i) => i.close > 0)) return 'closedDay';
  const fits = [...today, ...prev].some((i) => i.open <= start && end <= i.close);
  return fits ? 'open' : 'closed';
}

/** Earliest minute ≥ `from` at which a visit of `duration` fits in the opening hours, or null. */
export function earliestOpenStart(
  week: WeeklyHours | undefined,
  date: Date,
  from: number,
  duration: number,
): number | null {
  if (!week) return from;
  const day = date.getDay();
  const intervals = [
    ...week[(day + 6) % 7].map((i) => ({ open: i.open - 1440, close: i.close - 1440 })),
    ...week[day],
  ].sort((a, b) => a.open - b.open);
  for (const i of intervals) {
    const start = Math.max(from, i.open);
    if (start + duration <= i.close) return start;
  }
  return null;
}

export function describeHours(week: WeeklyHours | undefined, date: Date, clock: (m: number) => string): string | null {
  if (!week) return null;
  const today = week[date.getDay()];
  if (!today.length) return null;
  return today.map((i) => `${clock(i.open)}–${clock(i.close)}`).join(', ');
}
