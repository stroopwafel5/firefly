/**
 * Small helpers for the fuller descriptions the planner adds to planned places
 * (services/wikipedia.ts → describeAttraction). Pure, unit-tested.
 */

/** "https://en.wikipedia.org/wiki/Yarkon_Park" → ["en", "Yarkon Park"]. */
export function wikipediaTitle(url: string | undefined): [string, string] | null {
  const m = (url ?? '').match(/^https?:\/\/([a-z-]+)\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/);
  if (!m) return null;
  try {
    return [m[1], decodeURIComponent(m[2]).replace(/_/g, ' ')];
  } catch {
    return [m[1], m[2].replace(/_/g, ' ')];
  }
}

/** The article's first sentences: about three, at most `max` characters, cut at a sentence end. */
export function introduction(extract: string, max = 600): string {
  const text = extract.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  let out = '';
  for (const s of sentences) {
    if ((out + s).length > max) break;
    out += s;
  }
  return (out || `${text.slice(0, max - 1)}…`).trim();
}

/** The writing system of a name: 'latin', 'hebrew', 'cyrillic', 'other', or '' without letters. */
export function scriptOf(name: string): string {
  if (/[A-Za-zÀ-ɏ]/.test(name)) return 'latin';
  if (/[\u0590-\u05FF]/.test(name)) return 'hebrew';
  if (/[\u0400-\u04FF]/.test(name)) return 'cyrillic';
  return /\p{L}/u.test(name) ? 'other' : '';
}

/** The writing system of a Wikipedia edition ('en', 'simple', 'he', 'ru'). */
export const wikiScript = (wiki: string) => (wiki === 'he' ? 'hebrew' : wiki === 'ru' ? 'cyrillic' : 'latin');

/**
 * A business rather than a sight — a club, karaoke bar, pub, restaurant, café, shop, spa, rental,
 * karting or escape room. Its description comes only from itself (or from a Wikipedia article
 * linked to it directly): an article found near it is about something else ("Karafun Bruxelles"
 * got the Manstein plan, "Carmen's Corner" the Stock-im-Eisen).
 */
export function isBusinessVenue(a: { kind?: string; category?: string; name?: string }): boolean {
  if (['nightlife', 'food', 'shopping', 'spa', 'rental', 'adventure'].includes(a.kind ?? '')) return true;
  return /karaoke|(?:^|[^\p{L}])(bars?|pubs?|clubs?|nightclubs?|lounges?|restaurants?|caf[eé]s?|coffee|shops?|stores?|boutiques?|escape rooms?|bowling|cinemas?|casinos?|spas?|rentals?)(?![\p{L}])/iu.test(
    `${a.category ?? ''} ${a.name ?? ''}`,
  );
}
