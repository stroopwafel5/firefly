/**
 * Reads the weekly events list an admin uploads as a .txt file, in the form Firefly's team
 * already writes it (Russian, Hebrew or English):
 *
 *   Софаш
 *
 *   Четверг
 *   **
 *   Балет Щелкунчик в Нетании
 *   https://ru.kupatbravo.co.il/announce/…
 *
 *   Пятница
 *   …
 *
 * Day headings become dates in the chosen weekend; each title + link becomes one event. Lines
 * written under a link (before the next empty line) are notes for the reader ("Sacher Park,
 * 10:00"), useful when the link is an Instagram post that can't be read. The same link under
 * several days is one event on all those days. Pure: unit-tested.
 */

export type ListLang = 'ru' | 'he' | 'en';

export interface ListedEvent {
  title: string;
  /** '' when the admin gave no link (the event is then held back). */
  url: string;
  notes: string;
  /** Listed days, YYYY-MM-DD (empty when the list had no heading above it). */
  days: string[];
  /** 1-based line of the title in the file. */
  line: number;
}

export interface ParsedList {
  items: ListedEvent[];
  /** Day headings found, as written, with the date given to each. */
  headings: Array<{ text: string; date: string }>;
  /** Lines that were not used (list title, separators are not reported). */
  ignored: string[];
  /** Thursday of the chosen weekend. */
  weekStart: string;
  lang: ListLang;
}

/** Sunday = 0 … Saturday = 6. */
const DAY_WORDS: Array<[number, RegExp]> = [
  [0, /^(воскресенье|воскресение|вс|יום\s+ראשון|ראשון|sunday|sun)$/i],
  [1, /^(понедельник|пн|יום\s+שני|שני|monday|mon)$/i],
  [2, /^(вторник|вт|יום\s+שלישי|שלישי|tuesday|tue|tues)$/i],
  [3, /^(среда|среду|ср|יום\s+רביעי|רביעי|wednesday|wed)$/i],
  [4, /^(четверг|чт|יום\s+חמישי|חמישי|thursday|thu|thur|thurs)$/i],
  [5, /^(пятница|пятницу|пт|יום\s+שישי|שישי|friday|fri)$/i],
  [6, /^(суббота|субботу|сб|שבת|מוצאי\s+שבת|מוצ"ש|מוצ״ש|saturday|sat)$/i],
];

const SEPARATOR = /^[\s*\-–—_=~•·.#]+$/;
const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/i;

function cleanUrl(raw: string): string {
  let u = raw.replace(/[),.;:!?»"'\]]+$/, '');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
}

/** Same page, however it was pasted (Hebrew letters or %D7…, trailing slash, http/https). */
export function sameLinkKey(url: string): string {
  let u = url.trim();
  try {
    u = decodeURI(u);
  } catch {
    /* keep as is */
  }
  return u.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/[/#?]+$/, '').toLowerCase();
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (s: string) => new Date(`${s}T00:00:00Z`);
const addDays = (s: string, n: number) => ymd(new Date(utc(s).getTime() + n * 86_400_000));

/** The Thursday of "this weekend": this week's Thursday from Thursday to Saturday, else the next one. */
export function defaultWeekStart(today: string): string {
  const dow = utc(today).getUTCDay();
  const back = dow === 4 ? 0 : dow === 5 ? 1 : dow === 6 ? 2 : -((4 - dow + 7) % 7);
  return addDays(today, -back);
}

/** A day heading: the day's name, optionally with a date ("Четверг 15.10", "שישי, 16/10"). */
export function readHeading(line: string): { dow: number; day?: number; month?: number; year?: number } | null {
  const m = line
    .trim()
    .replace(/[:：]+$/, '')
    .match(/^(.+?)[\s,.\-–—(]*(?:(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?)?\)?\s*$/u);
  if (!m) return null;
  const word = m[1].trim().replace(/[\s,.\-–—:]+$/, '');
  const hit = DAY_WORDS.find(([, re]) => re.test(word));
  if (!hit) return null;
  const year = m[4] ? (m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4])) : undefined;
  return { dow: hit[0], day: m[2] ? Number(m[2]) : undefined, month: m[3] ? Number(m[3]) : undefined, year };
}

/** Date of a heading: its own date if written, else that weekday in the week of `weekStart`, never before the previous heading. */
function headingDate(h: NonNullable<ReturnType<typeof readHeading>>, weekStart: string, prev: string | null): string {
  if (h.day && h.month) {
    const y0 = utc(weekStart).getUTCFullYear();
    const options = (h.year ? [h.year] : [y0 - 1, y0, y0 + 1]).map((y) => `${y}-${pad(h.month!)}-${pad(h.day!)}`);
    // The written date closest to the chosen weekend.
    return options.sort((a, b) => Math.abs(utc(a).getTime() - utc(weekStart).getTime()) - Math.abs(utc(b).getTime() - utc(weekStart).getTime()))[0];
  }
  const sunday = addDays(weekStart, -4); // Israeli week: Sunday … Saturday around the Thursday
  let d = addDays(sunday, h.dow);
  while (prev && d < prev) d = addDays(d, 7); // "Saturday, Sunday" → the Sunday after
  return d;
}

export function listLanguage(text: string): ListLang {
  const cyr = (text.match(/[Ѐ-ӿ]/g) ?? []).length;
  const heb = (text.match(/[֐-׿]/g) ?? []).length;
  const lat = (text.replace(URL_RE, '').match(/[A-Za-z]/g) ?? []).length;
  if (cyr >= heb && cyr >= lat / 2 && cyr > 0) return 'ru';
  if (heb >= cyr && heb >= lat / 2 && heb > 0) return 'he';
  return 'en';
}

/** Per upload: what one processing run gets through in its 9 minutes. */
export const MAX_EVENTS = 40;

export function parseEventList(text: string, weekStart: string): ParsedList {
  const lines = text.replace(/\r\n?/g, '\n').replace(/‏|‎|﻿/g, '').split('\n');
  const items: ListedEvent[] = [];
  const headings: ParsedList['headings'] = [];
  const ignored: string[] = [];
  let day: string | null = null;

  // Blocks: runs of non-empty lines, cut at headings and separators.
  let block: Array<{ text: string; line: number }> = [];
  const flush = () => {
    if (!block.length) return;
    const b = block;
    block = [];
    const urlAt = b.map((l, i) => (URL_RE.test(l.text) ? i : -1)).filter((i) => i >= 0);
    if (!urlAt.length) {
      // A line or two with no link: the list's own title ("Софаш") or an event without a link.
      const title = b.map((l) => l.text).join(' ').trim();
      if (!day && !items.length) ignored.push(title);
      else items.push({ title, url: '', notes: '', days: day ? [day] : [], line: b[0].line });
      return;
    }
    let start = 0;
    urlAt.forEach((ui, k) => {
      const lineText = b[ui].text;
      const url = cleanUrl(lineText.match(URL_RE)![0]);
      const inline = lineText.replace(URL_RE, '').replace(/[\s:–—-]+$/, '').trim();
      const titleLines = [...b.slice(start, ui).map((l) => l.text), inline].filter(Boolean);
      const last = k === urlAt.length - 1;
      const notes = last ? b.slice(ui + 1).map((l) => l.text).join('\n') : '';
      const line = (start < ui ? b[start] : b[ui]).line;
      start = ui + 1;
      items.push({ title: titleLines.join(' ').trim(), url, notes, days: day ? [day] : [], line });
    });
  };

  lines.forEach((raw, i) => {
    const t = raw.trim();
    if (!t) return flush();
    if (SEPARATOR.test(t)) return flush();
    const h = readHeading(t);
    if (h && t.length <= 40) {
      flush();
      day = headingDate(h, weekStart, day);
      headings.push({ text: t, date: day });
      return;
    }
    block.push({ text: t, line: i + 1 });
  });
  flush();

  // One event per link: the same page under several days → all those days.
  const byLink = new Map<string, ListedEvent>();
  const merged: ListedEvent[] = [];
  for (const it of items) {
    const key = it.url ? sameLinkKey(it.url) : '';
    const prev = key ? byLink.get(key) : undefined;
    if (prev) {
      prev.days = [...new Set([...prev.days, ...it.days])].sort();
      if (it.notes && !prev.notes.includes(it.notes)) prev.notes = [prev.notes, it.notes].filter(Boolean).join('\n');
      continue;
    }
    const copy = { ...it, days: [...it.days] };
    if (key) byLink.set(key, copy);
    merged.push(copy);
  }
  return { items: merged.slice(0, MAX_EVENTS), headings, ignored, weekStart, lang: listLanguage(merged.map((m) => m.title).join(' ')) };
}

/** "Thursday 15 October 2026" for the reader. */
export function describeDays(days: string[]): string {
  return days
    .map((d) => utc(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }))
    .join(', ');
}

export { addDays as addDaysIso };
