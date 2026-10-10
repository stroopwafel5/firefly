import type { SearchArgs } from './types';

/** Pure helpers for Google event listings (no Firebase imports, unit-tested). */

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** "Oct 17" (no year) → the next 17 October on or after (today − 1 day). */
export function resolveDay(text: string, today = new Date()): string | null {
  const m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})/.exec(text) ?? /(\d{1,2})\s+([A-Za-z]{3})/.exec(text);
  if (!m) return null;
  const [monStr, dayStr] = /\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
  const mon = MONTHS[monStr.toLowerCase()];
  if (mon == null) return null;
  const day = Number(dayStr);
  const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));
  let d = new Date(Date.UTC(today.getUTCFullYear(), mon, day));
  if (d < base) d = new Date(Date.UTC(today.getUTCFullYear() + 1, mon, day));
  return d.toISOString().slice(0, 10);
}

/** Pulls the first time range out of strings like "Sat, Oct 17, 8 – 11 PM" or "7:30 PM – 10 PM". */
export function parseTimes(when: string): { start?: string; end?: string } {
  const re = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/gi;
  const parts: Array<{ h: number; m: number; ap?: string }> = [];
  // Drop the date part so "17" in "Oct 17" isn't read as a time.
  const timePart = when.replace(/^[^,]*,\s*[A-Za-z]{3}\s+\d{1,2},?/, '').replace(/[A-Za-z]{3}\s+\d{1,2}/g, '');
  let m: RegExpExecArray | null;
  while ((m = re.exec(timePart)) && parts.length < 2) {
    const h = Number(m[1]);
    if (h > 24) continue;
    parts.push({ h, m: Number(m[2] ?? 0), ap: m[3]?.toUpperCase() });
  }
  if (!parts.length || !/AM|PM|:\d{2}/i.test(timePart)) return {};
  const ap = parts[1]?.ap ?? parts[0].ap;
  const fmt = (p: { h: number; m: number; ap?: string }, fallbackAp?: string) => {
    let h = p.h;
    const a = p.ap ?? fallbackAp;
    if (a === 'PM' && h < 12) h += 12;
    if (a === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(p.m).padStart(2, '0')}`;
  };
  return { start: fmt(parts[0], ap), end: parts[1] ? fmt(parts[1]) : undefined };
}

export function hostname(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
}

/** The searches we run per place, in the user's language. */
export function googleQueries(place: string, lang: SearchArgs['lang'], query?: string): string[] {
  if (query) return [lang === 'he' ? `${query} ב${place}` : lang === 'ru' ? `${query} ${place}` : `${query} in ${place}`];
  // The second search looks past concerts: family workshops, guided tours, food and nature outings.
  if (lang === 'he') return [`אירועים ב${place}`, `סדנאות, סיורים מודרכים ופעילויות למשפחות ב${place}`];
  if (lang === 'ru') return [`мероприятия ${place}`, `мастер-классы, экскурсии и семейные мероприятия ${place}`];
  return [`events in ${place}`, `family workshops, guided tours and outdoor activities in ${place}`];
}
