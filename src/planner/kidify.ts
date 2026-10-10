import type { Lang } from '../i18n/localized';

/**
 * Helpers for the pink kids' plan. Everything shown to kids is sourced:
 *  - the kid description is the article intro from Simple English Wikipedia (written for
 *    young readers) or, in Hebrew/Russian, the first sentences of that language's Wikipedia —
 *    optionally rephrased for kids server-side (functions/src/kidify.ts) without adding facts;
 *  - the daily fun fact is a sentence quoted from the place's Wikipedia article, with the link.
 */

export function splitSentences(text: string): string[] {
  const clean = text
    .replace(/\s*\([^)]{0,120}\)/g, '') // drop pronunciations / bracketed asides
    .replace(/\s+/g, ' ')
    .trim();
  const parts = clean.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [];
  // Re-join pieces split on abbreviations like "St." or "U.S." (next piece starts lowercase or is very short).
  const out: string[] = [];
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    const prev = out[out.length - 1];
    if (prev && (/^[a-zа-яё]/.test(p) || /\b(St|Mt|Dr|Mr|Mrs|No|U\.S|ул|г|им)\.$/.test(prev))) {
      out[out.length - 1] = `${prev} ${p}`;
    } else {
      out.push(p);
    }
  }
  return out;
}

const FACT_HINTS: Record<Lang, RegExp> = {
  en: /\b(oldest|largest|biggest|tallest|highest|longest|first|only|record|world|million|century|built|discovered|named after)\b|\d/i,
  he: /הגדול|העתיק|הראשון|הגבוה|הארוך|היחיד|בעולם|מיליון|המאה|נבנה|נקרא|\d/,
  ru: /самы|крупнейш|древнейш|старейш|первы|высочайш|длиннейш|единственн|в мире|миллион|век|построен|назван|\d/i,
};

/**
 * Picks a "did you know?" sentence: prefers one with a number or a superlative, and avoids
 * the article's first sentence (which is usually just a definition).
 */
export function pickFunFact(extract: string, lang: Lang): string | null {
  const sentences = splitSentences(extract).filter((s) => s.length >= 30 && s.length <= 240);
  if (!sentences.length) return null;
  const rest = sentences.slice(1);
  const hit = rest.find((s) => FACT_HINTS[lang].test(s)) ?? sentences.find((s) => FACT_HINTS[lang].test(s));
  return (hit ?? rest[0] ?? sentences[0]).trim();
}

/** The first `max` sentences, trimmed to a kid-sized length. */
export function kidSummary(extract: string, max = 2, maxChars = 320): string | null {
  const s = splitSentences(extract).slice(0, max).join(' ');
  if (!s) return null;
  if (s.length <= maxChars) return s;
  const cut = s.slice(0, maxChars);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

/** Token overlap between a place name and a Wikipedia title (0..1), used to match articles. */
export function nameSimilarity(a: string, b: string): number {
  const tok = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length > 1 && !STOP.has(w)),
    );
  const A = tok(a);
  const B = tok(b);
  if (!A.size || !B.size) return 0;
  let common = 0;
  A.forEach((w) => B.has(w) && common++);
  return common / Math.min(A.size, B.size);
}

const STOP = new Set(['the', 'of', 'and', 'de', 'la', 'le', 'du', 'des', 'der', 'die', 'das', 'von', 'und', 'museum', 'park']);
