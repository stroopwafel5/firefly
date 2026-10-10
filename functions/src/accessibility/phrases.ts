/**
 * What counts as evidence that a venue supports a need, read from the venue's own website.
 *
 * Each need has its own phrases and nothing is shared between needs: a quiet room says nothing
 * about audio description. Phrases are specific on purpose — "blind" alone would match window
 * blinds, "lift" a ski lift, "subtitled" a foreign film — so only wording that a venue uses when
 * it describes a provision for that group is accepted. English, Hebrew and Russian (Firefly's
 * languages) plus French, German, Italian and Spanish (common trip destinations).
 */

export type Need = 'blind' | 'hearing' | 'autism' | 'physical';
export const NEEDS: Need[] = ['blind', 'hearing', 'autism', 'physical'];

export const NEED_PATTERNS: Record<Need, RegExp[]> = {
  blind: [
    /audio[- ]described|audio[- ]descriptions?|tactile (?:tours?|models?|maps?|exhibits?|replicas?|guides?|floor plans?)|touch tours?|braille|large[- ]print (?:guides?|maps?|labels?)|(?:blind|visually[- ]impaired|partially[- ]sighted|low[- ]vision) (?:visitors|guests|people|audiences)|guide dogs? (?:are )?welcome/i,
    /עיוורים|לקויי ראייה|לקויות ראייה|ברייל|תיאור קולי|הדרכה מישושית/,
    /незрячи|слабовидящ|шрифт(?:ом)? брайля|брайл|тифлокомментар|тактильн/i,
    /audiodescription|malvoyants?|non[- ]voyants?|maquettes? tactiles?|visites? tactiles?/i,
    /sehbehindert|blinde (?:menschen|besucher)|blindenleitsystem|tastmodell|audiodeskription/i,
    /ipovedenti|non vedenti|audiodescrizion|personas ciegas|baja visi[oó]n|audiodescripci[oó]n/i,
  ],
  hearing: [
    /hearing loops?|induction loops?|loop systems?|sign language|british sign language|american sign language|\bBSL\b|\bASL\b|deaf (?:and hard of hearing )?(?:visitors|guests|people|audiences)|hard[- ]of[- ]hearing|hearing[- ]impaired/i,
    /לקויי שמיעה|כבדי שמיעה|חירשים|לולאת השראה|לולאות השראה|שפת הסימנים|שפת סימנים/,
    /слабослышащ|глухих|жестов(?:ой|ом|ого) язык|индукционн(?:ая|ой|ые|ых) петл|сурдоперевод/i,
    /boucles? magnétiques?|boucles? à induction|langue des signes|malentendants?|personnes sourdes/i,
    /induktionsschleife|gebärdensprache|hörgeschädigt|gehörlos|schwerhörig/i,
    /lingua dei segni|non udenti|lengua de signos|personas sordas|bucle magn[eé]tico/i,
  ],
  autism: [
    /autism|autistic|sensory[- ]friendly|sensory (?:maps?|bags?|backpacks?|kits?|rooms?|guides?|stories|story)|quiet (?:rooms?|spaces?|zones?|hours?|sessions?)|relaxed (?:openings?|sessions?|performances?|visits?|mornings?)|low[- ]sensory|calm(?:ing)? (?:rooms?|spaces?|zones?)|hidden disabilit(?:y|ies)|sunflower lanyard|certified autism cent(?:er|re)|\bIBCCES\b|neurodivergent|neurodiverse/i,
    /אוטיזם|על הרצף|רגישות חושית|רגישויות חושיות|חדר שקט|חדר רגיעה|שעות שקטות|מוגבלויות סמויות/,
    /аутизм|аутичн|сенсорн(?:ая|ой|ые|ых|ую) (?:комнат|карт|сумк|разгрузк)|тих(?:ая|ой|ую) комнат|тихие часы|нейроотличн/i,
    /autisme|autistes?|heures? calmes?|kits? sensoriels?|salles? (?:calmes?|sensorielles?)/i,
    /autismus|autist|reizarm|ruheraum|stille stunde/i,
    /autismo|aut[ií]stic|sala tranquila|stanza tranquilla|ora silenziosa|hora tranquila/i,
  ],
  physical: [
    /wheelchairs? (?:accessible|access|users?|available|friendly|hire|loans?)|wheelchair-accessible|step[- ]free|level access|accessible (?:toilets?|restrooms?|bathrooms?|entrances?|parking|routes?|lifts?|elevators?)|disabled (?:toilets?|parking|access)|mobility (?:scooters?|impaired|aids?)|ramped access|barrier[- ]free/i,
    /כיסא גלגלים|כסא גלגלים|כיסאות גלגלים|נגיש לנכים|נגיש לבעלי מוגבלויות|שירותי נכים|חניית נכים|חניות נכים|נגיש לכיסאות/,
    /инвалидн(?:ая|ой|ых|ые|ую) коляс|колясочник|маломобильн|пандус|безбарьерн/i,
    /fauteuils? roulants?|personnes à mobilité réduite|\bPMR\b|rampe d'accès|accès de plain-pied/i,
    /rollstuhl|barrierefrei|stufenlos|behindertengerecht/i,
    /sedia a rotelle|sedie a rotelle|senza barriere|silla de ruedas|sillas de ruedas|movilidad reducida/i,
  ],
};

/** For each need, the first phrase that matches (with a little context), or nothing. */
export function findNeeds(text: string, wanted: readonly Need[] = NEEDS): Partial<Record<Need, string>> {
  const out: Partial<Record<Need, string>> = {};
  for (const need of wanted) {
    for (const re of NEED_PATTERNS[need]) {
      const m = re.exec(text);
      if (m) {
        const from = Math.max(0, m.index - 30);
        out[need] = text.slice(from, m.index + m[0].length + 30).replace(/\s+/g, ' ').trim();
        break;
      }
    }
  }
  return out;
}

/** Visible text of a page (scripts, styles and tags removed). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const ACCESS_LINK = /accessib|accessibilit|\baccess\b|disab|special[- ]needs|visitors? with|נגישות|הנגשה|доступн|инвалид|barrierefrei|handicap|accesibilidad|accessibilit[aà]/i;

/** Links on a page that probably lead to its accessibility information (same site first). */
export function accessLinks(html: string, pageUrl: string, max = 2): string[] {
  const base = new URL(pageUrl);
  const found: string[] = [];
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const href = m[1];
    const text = htmlToText(m[2]);
    if (!ACCESS_LINK.test(href) && !ACCESS_LINK.test(text)) continue;
    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(abs.protocol)) continue;
    abs.hash = '';
    const s = abs.toString();
    if (!found.includes(s) && s !== base.toString()) found.push(s);
  }
  const host = base.hostname.replace(/^www\./, '');
  return [...found.filter((u) => new URL(u).hostname.replace(/^www\./, '') === host), ...found.filter((u) => new URL(u).hostname.replace(/^www\./, '') !== host)].slice(0, max);
}

/**
 * Only public web addresses are fetched (no IP literals, no local or internal names), because
 * the address can come from the app.
 */
export function isPublicWebUrl(u: string): boolean {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(url.protocol)) return false;
  const h = url.hostname.toLowerCase();
  if (!h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':') || h.startsWith('[')) return false;
  if (/(^|\.)(localhost|local|internal|localdomain|intranet|corp|home|lan)$/.test(h)) return false;
  if (h === 'metadata.google.internal') return false;
  return true;
}
