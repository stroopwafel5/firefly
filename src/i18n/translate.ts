import en, { Dictionary, TKey } from './en';
import he from './he';
import ru from './ru';
import { Lang, PROVIDER_LANG } from './localized';

export const DICTIONARIES: Record<Lang, Dictionary> = { en, he, ru };

export type Params = Record<string, string | number>;

export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

export function translate(lang: Lang, key: TKey, params?: Params): string {
  const dict = DICTIONARIES[lang] ?? en;
  return interpolate(dict[key] ?? en[key] ?? key, params);
}

export type PluralForm = 'one' | 'few' | 'many' | 'other';

export function pluralForm(lang: Lang, n: number): PluralForm {
  const abs = Math.abs(n);
  if (lang === 'ru') {
    if (!Number.isInteger(abs)) return 'other';
    const m10 = abs % 10;
    const m100 = abs % 100;
    if (m10 === 1 && m100 !== 11) return 'one';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'few';
    return 'many';
  }
  return abs === 1 ? 'one' : 'other';
}

/** Plural-aware translate: tp('common.days', 3) looks up common.days_few etc. */
export function translatePlural(lang: Lang, base: string, n: number, params?: Params): string {
  const key = `${base}_${pluralForm(lang, n)}` as TKey;
  const fallback = `${base}_other` as TKey;
  const dict = DICTIONARIES[lang];
  const template = dict[key] ?? dict[fallback] ?? en[fallback] ?? base;
  return interpolate(template, { n, ...params });
}

export function formatDate(lang: Lang, d: Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  try {
    return new Intl.DateTimeFormat(PROVIDER_LANG[lang].locale, opts).format(d);
  } catch {
    return d.toDateString();
  }
}

export function formatDateRange(lang: Lang, start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const s = formatDate(lang, start, sameYear ? { day: 'numeric', month: 'short' } : undefined);
  const e = formatDate(lang, end);
  return translate(lang, 'common.dateRange', { start: s, end: e });
}

export function formatPrice(lang: Lang, amount: number, currency = 'EUR'): string {
  try {
    return new Intl.NumberFormat(PROVIDER_LANG[lang].locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Minutes after midnight → "HH:MM" (wraps past midnight: 1500 → "01:00"). */
export function formatClock(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function formatDuration(lang: Lang, minutes: number): string {
  const m = Math.max(1, Math.round(minutes));
  if (m < 60) return translate(lang, 'common.minutes', { n: m });
  return translate(lang, 'common.hoursMinutes', { h: Math.floor(m / 60), m: m % 60 });
}

export function countryName(lang: Lang, code: string): string {
  const key = `country.${code.toUpperCase()}` as TKey;
  if (key in DICTIONARIES[lang]) return translate(lang, key);
  try {
    // Hermes ships Intl.DisplayNames on recent React Native; fall back to the code if not.
    const DN = (Intl as unknown as { DisplayNames?: new (l: string[], o: { type: string }) => { of(c: string): string } })
      .DisplayNames;
    if (DN) return new DN([PROVIDER_LANG[lang].locale], { type: 'region' }).of(code.toUpperCase()) ?? code;
  } catch {
    /* ignore */
  }
  return code;
}
