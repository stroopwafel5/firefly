/**
 * What counts as evidence that a venue supports a need, read from the venue's own website.
 *
 * Each need has its own phrases and nothing is shared between needs: a quiet room says nothing
 * about audio description. Phrases are specific on purpose — "blind" alone would match window
 * blinds, "lift" a ski lift, "subtitled" a foreign film — so only wording that a venue uses when
 * it describes a provision for that group is accepted. English, Hebrew and Russian (Firefly's
 * languages), Arabic (Morocco, Israel, Jordan, Egypt…), French, German, Dutch, Italian, Spanish,
 * Portuguese, Polish, Czech, Turkish and Japanese.
 *
 * Two kinds of match are ignored (findNeeds): a statement about the WEBSITE's accessibility
 * ("this site works with screen readers for blind users", Israel's mandatory "הצהרת נגישות",
 * Russian sites' "версия для слабовидящих"), and a negated one ("not wheelchair accessible").
 */

export type Need = 'blind' | 'hearing' | 'autism' | 'physical';
export const NEEDS: Need[] = ['blind', 'hearing', 'autism', 'physical'];

export const NEED_PATTERNS: Record<Need, RegExp[]> = {
  blind: [
    /audio[- ]described|audio[- ]descriptions?|tactile (?:tours?|models?|maps?|exhibits?|replicas?|guides?|floor plans?)|touch tours?|braille|large[- ]print (?:guides?|maps?|labels?)|(?:blind|visually[- ]impaired|partially[- ]sighted|low[- ]vision) (?:visitors|guests|people|audiences)|guide dogs? (?:are )?welcome/i,
    /עיוורים|לקויי ראייה|לקויות ראייה|מוגבלי ראייה|מוגבלות ראייה|ברייל|תיאור קולי|הדרכה מישושית/,
    /незрячи|слабовидящ|шрифт(?:ом)? брайля|брайл|тифлокомментар|тактильн/i,
    /المكفوفين|للمكفوفين|ضعاف البصر|ضعيفي البصر|الإعاقة البصرية|برايل|الوصف الصوتي/,
    /audiodescription|malvoyants?|non[- ]voyants?|personnes aveugles|visiteurs aveugles|déficients? visuels?|déficience visuelle|maquettes? tactiles?|visites? tactiles?/i,
    /sehbehindert|blinde (?:menschen|besucher)|blindenleitsystem|tastmodell|audiodeskription/i,
    /blinden en slechtzienden|blinde en slechtziende|slechtzienden|slechtziende (?:bezoekers|mensen)|audiodescriptie|voelroute|tastroute/i,
    /ipovedenti|non vedenti|audiodescrizion|personas ciegas|baja visi[oó]n|audiodescripci[oó]n/i,
    /deficientes visuais|deficiência visual|pessoas cegas|audiodescrição|maquetes? táte?is|maquete tátil|piso tátil|\bbraile\b/i,
    /niewidom|słabowidząc|brajl|audiodeskrypc|tyflograf|makiet\w* dotykow|ścieżk\w* dotykow/i,
    /nevidom|slabozrak|braillov|hmatov(?:é|á|ý|ých) (?:model|maket|plán|exponát|prohlídk)|audiodeskripc/i,
    /görme engelli|sesli betimleme|dokunsal (?:harita|maket|yol)/i,
    /視覚障害|視覚障がい|点字|触地図|触知図/,
  ],
  hearing: [
    /hearing loops?|induction loops?|loop systems?|sign language|british sign language|american sign language|\bBSL\b|\bASL\b|deaf (?:and hard of hearing )?(?:visitors|guests|people|audiences)|hard[- ]of[- ]hearing|hearing[- ]impaired/i,
    /לקויי שמיעה|כבדי שמיעה|חירשים|לולאת השראה|לולאות השראה|שפת הסימנים|שפת סימנים/,
    /слабослышащ|глухих|жестов(?:ой|ом|ого) язык|индукционн(?:ая|ой|ые|ых) петл|сурдоперевод/i,
    /(?:^|[^\p{L}])(?:ال|لل)صم(?![\p{L}])|ضعاف السمع|الإعاقة السمعية|لغة الإشارة|لغة الاشارة/u,
    /boucles? magnétiques?|boucles? à induction|langue des signes|malentendants?|personnes sourdes|déficients? auditifs?|déficience auditive/i,
    /induktionsschleife|gebärdensprache|hörgeschädigt|gehörlos|schwerhörig/i,
    /doven en slechthorenden|slechthorenden|slechthorende (?:bezoekers|mensen)|gebarentaal|ringleiding/i,
    /lingua dei segni|non udenti|lengua de signos|personas sordas|bucle magn[eé]tico/i,
    /deficientes auditivos|deficiência auditiva|pessoas surdas|língua gestual|língua de sinais/i,
    /niesłysząc|słabosłysząc|języ\w* migow|pętl\w* indukcyjn/i,
    /neslyšíc|nedoslýchav|znakov(?:ý|ém|ého|ým) jazyk|indukční smyčk/i,
    /işitme engelli|işaret dili/i,
    /聴覚障害|聴覚障がい|手話|筆談|補聴/,
  ],
  autism: [
    /autism|autistic|sensory[- ]friendly|sensory (?:maps?|bags?|backpacks?|kits?|rooms?|guides?|stories|story)|quiet (?:rooms?|spaces?|zones?|hours?|sessions?)|relaxed (?:openings?|sessions?|performances?|visits?|mornings?)|low[- ]sensory|calm(?:ing)? (?:rooms?|spaces?|zones?)|hidden disabilit(?:y|ies)|sunflower lanyard|certified autism cent(?:er|re)|\bIBCCES\b|neurodivergent|neurodiverse/i,
    /אוטיזם|אוטיסט|על הרצף|על הספקטרום|רגישות חושית|רגישויות חושיות|חדר שקט|חדר רגיעה|שעות שקטות|מוגבלויות סמויות/,
    /аутизм|аутичн|сенсорн(?:ая|ой|ые|ых|ую) (?:комнат|карт|сумк|разгрузк)|тих(?:ая|ой|ую) комнат|тихие часы|нейроотличн/i,
    /(?:^|[^\p{L}])(?:ال|بال|لل)توحد(?![\p{L}])|طيف التوحد|المتوحدين/u,
    /autisme|autistes?|heures? calmes?|kits? sensoriels?|salles? (?:calmes?|sensorielles?)|espaces? (?:calmes?|sensoriels?)/i,
    /autismus|autist|reizarm|ruheraum|stille stunde/i,
    /prikkelarm|prikkelvrij|stilteruimte/i,
    /autismo|aut[ií]stic|sala tranquila|stanza tranquilla|ora silenziosa|hora tranquila|sala sensorial|hora silenciosa|horário silencioso/i,
    /autyzm|autystyczn|stref\w* (?:wyciszenia|ciszy)|pok[oó]j wyciszeń|cich\w* godzin/i,
    /klidov(?:á|é) (?:místnost|zón)|tich(?:á|é|ou) (?:místnost|hodin)/i,
    /otizm|otistik/i,
    /自閉症|カームダウン|センサリールーム|センサリーマップ/,
  ],
  physical: [
    /wheelchairs? (?:accessible|access|users?|available|friendly|hire|loans?)|wheelchair-accessible|step[- ]free|level access|accessible (?:toilets?|restrooms?|bathrooms?|entrances?|parking|routes?|lifts?|elevators?)|disabled (?:toilets?|parking|access)|mobility (?:scooters?|impaired|aids?)|ramped access|barrier[- ]free/i,
    /כיסא גלגלים|כסא גלגלים|כיסאות גלגלים|כסאות גלגלים|נגיש לנכים|נגיש לבעלי מוגבלויות|שירותי נכים|חניית נכים|חניות נכים|נגיש לכיסאות|מעלית נגישה/,
    /инвалидн(?:ая|ой|ых|ые|ую) коляс|колясочник|маломобильн|пандус|безбарьерн/i,
    /الكراسي المتحركة|كرسي متحرك|الكرسي المتحرك|كراسي متحركة|الإعاقة الحركية|الاعاقة الحركية/,
    /fauteuils? roulants?|personnes à mobilité réduite|\bPMR\b|rampe d'accès|accès de plain-pied/i,
    /rollstuhl|barrierefrei|stufenlos|behindertengerecht/i,
    /rolstoel|mindervaliden|invalidentoilet|drempelvrij/i,
    /sedia a rotelle|sedie a rotelle|senza barriere|silla de ruedas|sillas de ruedas|movilidad reducida/i,
    /cadeiras? de rodas|mobilidade reduzida|mobilidade condicionada/i,
    /inwalidzk|niepełnosprawnością ruchową|niepełnosprawnych ruchowo|bez barier architektonicznych/i,
    /bezbariérov|vozíčkář|invalidní\w* vozík|sníženou pohyblivostí/i,
    /tekerlekli sandalye|engelli rampası|engelli tuvaleti/i,
    /車椅子|車いす|バリアフリー|多目的トイレ/,
  ],
};

/** Words of a statement about the website itself (screen readers, browsers, web standards). */
const WEB_CONTEXT =
  /screen[- ]?readers?|\bWCAG\b|\bARIA\b|web accessib\p{L}*|digital accessib\p{L}*|accessib\p{L}* (?:of|on) (?:this|the|our) (?:web ?site|site)|this (?:web ?)?site|browsers?|keyboard (?:navigation|shortcuts?)|קוראי? מסך|תוכנ\p{L}* (?:הקראה|נגישות)|תוכנות עזר|דפדפן|ניווט (?:ב)?מקלדת|5568|תפריט נגישות|סרגל נגישות|רכיב נגישות|תוסף נגישות|הגדלת (?:ה)?(?:גופן|טקסט)|ניגודיות|экранн\p{L}* (?:чтец|чтени|диктор|доступ)|верси\p{L}* (?:сайта )?для слабовидящих|lecteurs? d['’]écran|accessibilité (?:du|de ce) site|navigateur|\bRGAA\b|screenreader|barrierefreiheit (?:der|dieser) (?:webseite|website|internetseite)|\bBITV\b|lector(?:es)? de pantalla|accesibilidad (?:del|de este) sitio|lettori? di schermo|accessibilità del sito|قارئ الشاشة|schermlezer|czytnik\p{L}* ekranu|čtečk\p{L}* obrazovky|leitor(?:es)? de (?:tela|ecrã)|ekran okuyucu|スクリーンリーダー|ウェブアクセシビリティ/iu;

/** A negation just before a phrase ("not wheelchair accessible", "אין גישה…", "pas accessible"). */
const NEGATION =
  /(?:^|[^\p{L}])(?:not|no|isn['’]t|aren['’]t|unfortunately|without|לא|אין|אינו|אינה|אינם|не|нет|pas|nicht|keine?|non|niet|geen|nie|není|nejsou|não|sem|değil|غير|لا|ليس)[^\p{L}][^.!?]{0,20}$/iu;

const GLOBAL: Record<Need, RegExp[]> = Object.fromEntries(
  NEEDS.map((n) => [n, NEED_PATTERNS[n].map((re) => new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))]),
) as Record<Need, RegExp[]>;

/** The sentence around a match (at most 200 characters each side). */
function sentenceAround(text: string, from: number, to: number): string {
  let a = Math.max(0, from - 200);
  const before = text.slice(a, from);
  const stop = Math.max(before.lastIndexOf('. '), before.lastIndexOf('! '), before.lastIndexOf('? '), before.lastIndexOf('。'));
  if (stop >= 0) a += stop + 1;
  const after = text.slice(to, to + 200);
  const ends = [after.indexOf('. '), after.indexOf('! '), after.indexOf('? '), after.indexOf('。')].filter((i) => i >= 0);
  return text.slice(a, to + (ends.length ? Math.min(...ends) : after.length));
}

/**
 * For each need, the first phrase that matches (with a little context), or nothing. Matches in a
 * sentence about the website's own accessibility, and negated ones, don't count.
 */
export function findNeeds(text: string, wanted: readonly Need[] = NEEDS): Partial<Record<Need, string>> {
  const out: Partial<Record<Need, string>> = {};
  for (const need of wanted) {
    search: for (const re of GLOBAL[need]) {
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        if (!m[0]) {
          re.lastIndex++;
          continue;
        }
        const start = m.index;
        const end = start + m[0].length;
        if (WEB_CONTEXT.test(sentenceAround(text, start, end))) continue;
        if (NEGATION.test(text.slice(Math.max(0, start - 40), start + (/^[^\p{L}]/u.test(m[0]) ? 1 : 0)))) continue;
        out[need] = text.slice(Math.max(0, start - 30), end + 30).replace(/\s+/g, ' ').trim();
        break search;
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

/** Links that name accessibility (in the languages above). */
const ACCESS_LINK =
  /accessib|accessibilit|disab|special[- ]needs|visitors? with|נגישות|הנגשה|инвалид|доступная[-_ ]среда|barrierefrei|handicap|accesibilidad|accessibilit[aà]|toegankelijk|dostępnoś|niepełnospraw|přístupnost|bezbariér|acessibilidade|erişilebilir|engelli|إمكانية[-_ ]الوصول|ذوي[-_ ]الإعاقة|ذوي[-_ ]الاحتياجات|バリアフリー|アクセシビリティ/i;
/** Links that may lead there ("Access", "Доступность"): only after the ones above. */
const MAYBE_ACCESS_LINK = /\baccess\b|доступн/i;

/**
 * Links on a page that probably lead to its accessibility information: links naming
 * accessibility first (same site before other sites), then the vaguer "Access" ones.
 */
export function accessLinks(html: string, pageUrl: string, max = 2): string[] {
  const base = new URL(pageUrl);
  const strong: string[] = [];
  const weak: string[] = [];
  const re = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const href = m[1];
    const text = htmlToText(m[2]);
    let decoded = href;
    try {
      decoded = decodeURIComponent(href);
    } catch {
      /* keep it as written */
    }
    const isStrong = ACCESS_LINK.test(decoded) || ACCESS_LINK.test(text);
    if (!isStrong && !MAYBE_ACCESS_LINK.test(decoded) && !MAYBE_ACCESS_LINK.test(text)) continue;
    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(abs.protocol)) continue;
    abs.hash = '';
    const s = abs.toString();
    if (s === base.toString() || strong.includes(s) || weak.includes(s)) continue;
    (isStrong ? strong : weak).push(s);
  }
  const host = base.hostname.replace(/^www\./, '');
  const same = (u: string) => new URL(u).hostname.replace(/^www\./, '') === host;
  return [...strong.filter(same), ...strong.filter((u) => !same(u)), ...weak.filter(same)].slice(0, max);
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
