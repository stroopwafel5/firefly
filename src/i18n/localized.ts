export type Lang = 'en' | 'he' | 'ru';
export const LANGS: Lang[] = ['en', 'he', 'ru'];
export const RTL_LANGS: Lang[] = ['he'];

export type LocalizedText = Record<Lang, string>;

export function L(en: string, he: string, ru: string): LocalizedText {
  return { en, he, ru };
}

export function pick(text: LocalizedText | string | undefined, lang: Lang): string {
  if (text == null) return '';
  if (typeof text === 'string') return text;
  return text[lang] || text.en;
}

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'he' || v === 'ru';
}

/** Wikipedia subdomain and TripAdvisor / Ticketmaster language codes per app language. */
export const PROVIDER_LANG: Record<Lang, { wiki: string; tripadvisor: string; ticketmaster: string; locale: string }> = {
  en: { wiki: 'en', tripadvisor: 'en', ticketmaster: 'en-us', locale: 'en-GB' },
  he: { wiki: 'he', tripadvisor: 'iw', ticketmaster: 'he', locale: 'he-IL' },
  ru: { wiki: 'ru', tripadvisor: 'ru', ticketmaster: 'ru', locale: 'ru-RU' },
};
