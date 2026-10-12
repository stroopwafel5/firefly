import type { EventType } from './common';

/**
 * What kind of place an attraction is. The server sets it (from Wikidata's class or
 * Tripadvisor's category — functions/src/attractions/kinds.ts); older saved trips without it
 * are classified here from their category text. The kind picks the emoji on the trip plan:
 * nature → 🌳 (Plitvice), history → 🏰 (the Colosseum), museum → 🏛️…
 */
export type AttractionKind =
  | 'castle' | 'palace' | 'fortress' | 'ruins' | 'monument' | 'oldtown' | 'square' | 'bridge' | 'tower'
  | 'museum' | 'gallery' | 'church' | 'monastery' | 'synagogue' | 'mosque'
  | 'nationalpark' | 'reserve' | 'park' | 'garden' | 'lake' | 'waterfall' | 'cave' | 'canyon' | 'beach' | 'viewpoint'
  | 'zoo' | 'aquarium' | 'themepark' | 'theatre' | 'market' | 'food' | 'nightlife' | 'shopping' | 'spa' | 'rental' | 'adventure' | 'other';

export const KIND_EMOJI: Record<AttractionKind, string> = {
  castle: '🏰', palace: '🏰', fortress: '🏰', ruins: '🏰', monument: '🏰', oldtown: '🏰', square: '🏰', bridge: '🌉', tower: '🗼',
  museum: '🏛️', gallery: '🖼️', church: '⛪', monastery: '⛪', synagogue: '🕍', mosque: '🕌',
  nationalpark: '🌳', reserve: '🌳', park: '🌳', garden: '🌷', lake: '🏞️', waterfall: '🏞️', cave: '🦇', canyon: '⛰️', beach: '🏖️', viewpoint: '🔭',
  zoo: '🦁', aquarium: '🐠', themepark: '🎢', theatre: '🎭', market: '🧺', food: '🍽️', nightlife: '🌙', shopping: '🛍️', spa: '♨️', rental: '🚲', adventure: '🪂', other: '📍',
};

/** Emoji by trip type, for places whose kind is unknown. */
export const TYPE_EMOJI: Record<EventType, string> = {
  Nature: '🌳', History: '🏰', Theatre: '🎭', Festival: '🎉', Food: '🍽️', Tour: '🧭', Family: '🎡', 'Kid Friendly': '🧸',
  Shopping: '🛍️', Beaches: '🏖️', 'Extreme Sport': '🪂', 'Night Clubs': '🎶',
};

/** The trip types each kind counts for (same table as the server's kinds.ts). */
export const KIND_TYPES: Record<AttractionKind, EventType[]> = {
  castle: ['History', 'Tour', 'Family'], palace: ['History', 'Tour'], fortress: ['History', 'Tour'], ruins: ['History', 'Tour'],
  monument: ['History', 'Tour'], oldtown: ['History', 'Tour'], square: ['Tour', 'History'], bridge: ['Tour', 'History'], tower: ['Tour', 'History'],
  museum: ['History', 'Family'], gallery: ['History'], church: ['History'], monastery: ['History'], synagogue: ['History'], mosque: ['History'],
  nationalpark: ['Nature', 'Family'], reserve: ['Nature'], park: ['Nature', 'Family', 'Kid Friendly'], garden: ['Nature', 'Family'],
  lake: ['Nature', 'Family'], waterfall: ['Nature', 'Family'], cave: ['Nature', 'Family'], canyon: ['Nature'], beach: ['Beaches', 'Nature', 'Family', 'Kid Friendly'],
  viewpoint: ['Nature', 'Tour'], zoo: ['Family', 'Kid Friendly', 'Nature'], aquarium: ['Family', 'Kid Friendly'], themepark: ['Family', 'Kid Friendly'],
  theatre: ['Theatre'], market: ['Food', 'Tour', 'Shopping'], food: ['Food'], nightlife: ['Night Clubs'], shopping: ['Shopping'], spa: [], rental: [], adventure: ['Extreme Sport', 'Nature'], other: ['Tour'],
};

/** Listed as restaurants but not a place for a family meal (a beer spa, a brewing school…). */
export const NOT_A_MEAL =
  /\bbeer\s*(spa|baths?)\b|\bbaths?\b.*\bbeer\b|brewing school|brewery tours?|beer tours?|pub crawl|cooking class|tasting tour|night\s*club|strip club|hookah|shisha|casino|\bspa\b|wellness|пивн\w* (ванн|спа)|пивоварн\w* школ|ספא בירה/i;

/** Never planned as sights (food places only when the traveller picked Food). */
export const NOT_A_SIGHT: ReadonlySet<AttractionKind> = new Set<AttractionKind>(['nightlife', 'shopping', 'spa', 'rental']);

/** Adventure and extreme sports (before rentals: "jet ski rental" is the activity). */
export const ADVENTURE_TEXT =
  /zip ?-?lines?|bungee|sky ?div|paraglid|parasail|hang ?glid|white ?water|rafting|canyoning|\batvs?\b|quad bik|off-?road|4\s?x\s?4|jeep (tours?|safari)|dune bashing|via ferrata|rock climbing|climbing (gym|wall|centre|center)|bouldering|kite ?surf|wind ?surf|surf (school|lessons?|camp)|wake ?board|scuba|diving cent|dive (cent|shop|school)|go-?karts?|karting|paintball|laser tag|rope park|ropes course|adventure park|aerial adventure|sandboard|jet ?ski|adrenaline|extreme sport|ski (resort|area|lift)|snowboard|bobsled|toboggan|alpine coaster|cliff jump/i;

const TEXT_KINDS: Array<[RegExp, AttractionKind]> = [
  [ADVENTURE_TEXT, 'adventure'],
  [/bike rental|car rental|rental|equipment hire|scooter/i, 'rental'],
  [/\bspa\b|wellness|massage|beer spa|beer bath|thermal bath|sauna/i, 'spa'],
  [/\bbars?\b|\bpubs?\b|nightlife|karaoke|nightclub|casino|lounge|cocktail/i, 'nightlife'],
  [/shopping|\bshops?\b|store|boutique|mall|outlet|gift|antique|flea/i, 'shopping'],
  [/restaurant|eat & drink|cafe|café|coffee|bakery|brewer|winer|distiller|food tour|tasting|cooking class|culinary/i, 'food'],
  [/national park/i, 'nationalpark'],
  [/nature reserve|wildlife area|reserve/i, 'reserve'],
  [/waterfall/i, 'waterfall'],
  [/cave|grotto/i, 'cave'],
  [/canyon|gorge/i, 'canyon'],
  [/lake|bodies of water/i, 'lake'],
  [/beach/i, 'beach'],
  [/zoo|safari|wildlife park/i, 'zoo'],
  [/aquarium/i, 'aquarium'],
  [/theme park|amusement|water park/i, 'themepark'],
  [/castle|château|chateau/i, 'castle'],
  [/palace/i, 'palace'],
  [/fortress|citadel|\bfort\b/i, 'fortress'],
  [/ruins|archaeolog/i, 'ruins'],
  [/art museum|gallery/i, 'gallery'],
  [/museum/i, 'museum'],
  [/synagogue/i, 'synagogue'],
  [/mosque/i, 'mosque'],
  [/monaster|abbey|convent/i, 'monastery'],
  [/church|cathedral|basilica|chapel/i, 'church'],
  [/theat|theater|opera|concert hall|ballet/i, 'theatre'],
  [/market/i, 'market'],
  [/garden/i, 'garden'],
  [/park/i, 'park'],
  [/observation|viewpoint|lookout|scenic/i, 'viewpoint'],
  [/tower/i, 'tower'],
  [/bridge/i, 'bridge'],
  [/old town|historic district|neighbo/i, 'oldtown'],
  [/square|plaza/i, 'square'],
  [/monument|memorial|statue|fountain|landmark/i, 'monument'],
];

const KINDS = new Set<string>(Object.keys(KIND_EMOJI));
export const isKind = (s: unknown): s is AttractionKind => typeof s === 'string' && KINDS.has(s);

export function kindFromText(text: string): AttractionKind {
  for (const [re, kind] of TEXT_KINDS) if (re.test(text)) return kind;
  return 'other';
}

/** The emoji for a place: by its kind, else by its first trip type. */
export function attractionEmoji(a: { kind?: AttractionKind; types: EventType[]; category?: string; name?: string }): string {
  const kind = a.kind ?? kindFromText(`${a.category ?? ''} ${a.name ?? ''}`);
  if (kind !== 'other') return KIND_EMOJI[kind];
  return a.types[0] ? TYPE_EMOJI[a.types[0]] : KIND_EMOJI.other;
}

/**
 * Popularity on a 0–10 scale. Set by the server; for older data, Tripadvisor's rating doubled
 * and pulled towards 7.0 when there are few reviews (same formula as the server).
 */
export function popularityOf(a: { popularity?: number; rating?: number; numReviews?: number }): number {
  if (a.popularity != null && Number.isFinite(a.popularity)) return a.popularity;
  if (a.rating == null) return 6.5;
  const v = Math.max(0, a.numReviews ?? 0);
  const m = 50;
  return Math.round(Math.min(10, (v / (v + m)) * a.rating * 2 + (m / (v + m)) * 7) * 10) / 10;
}

/* ---------------- tour companies, agencies and lodging are not attractions ---------------- */

/** Activities are fine even when sold as "tours" (Jeep tours, kayaking, balloon rides…). */
const ACTIVITY =
  /\b(jeeps?|4\s?x\s?4|4wd|off[- ]?road|atvs?|quads?|buggy|buggies|segways?|kayak\w*|canoe\w*|boats?|cruises?|sail\w*|yachts?|rafting|zip\s?lines?|balloons?|horse\w*|camels?|donkeys?|safaris?|snorkel\w*|div(e|es|ing)|surf\w*|paraglid\w*|bikes?|bicycles?|cycling|e-?bikes?|climbing|rappel\w*|abseil\w*|hiking|trekking|escape (room|game)s?)\b|ג'?יפ|ג׳יפ|טרקטורון|רייזר|קיאק|שייט|רכיבה|סוסים|גמלים|צלילה|כדור פורח|אופניים|סנפלינג|джип|квадроцикл|сафари|каяк|лодк|яхт|верхов|конн|дайвинг|воздушн[а-яё]* шар|велосипед/i;

/** Names that say "a company": always an organization, unless it sells an activity. */
const COMPANY_NAME =
  /\b(travels?|travel agency|tourism|agenzia|agenzie|agencia|agência|agence|agentur|reisebüro|reiseveranstalter|reisbureau|biuro podróży|cestovní kancelář|touristik|reisen|voyages?|viaggi|turismo|agency|agencies|company|co\.|ltd\.?|inc\.?|llc|gmbh|s\.?r\.?o\.?|sp\. ?z ?o\.?o\.?|b\.?v\.?|services|transfers?|taxis?|limo(usine)?s?|shuttles?|chauffeurs?|drivers?|incoming|dmc|holidays|vacations|guest\s?houses?|hostels?|hotels?|motels?|b\s?&\s?b|bed\s+(&|and)\s+breakfast|zimmer|apartments?|suites|tour operators?|tour guides?|private guides?|guiding|radisson|hilton|marriott|sheraton|novotel|ibis|mercure|sofitel|pullman|hyatt|intercontinental|crowne plaza|holiday inn|best western|scandic|kempinski|leonardo|fattal|isrotel)\b|סוכנות|תיירות|צימר|אכסניה|בית הארחה|הסעות|מדריך טיולים|турагент|туроператор|туристическ[а-яё]* (компания|агентство)|гостев[а-яё]* дом|хостел|отель|гостиниц|трансфер|такси/i;

/** Names of lodging that also appear in real sights ("Jamaica Inn", "The Old Inn Museum"). */
const LODGING_NAME = /\b(inns?|lodges?|resorts?)\b|旅馆|酒店|宾馆|客栈/i;

/** Names that usually mean a tour seller, but also appear in real sights ("Tours Cathedral"). */
const TOURS_NAME =
  /\b(tours|excursions?|trips|expeditions?|(private|guided|day|walking|city|custom|food|wine|bus|minibus|vip|luxury|bible|holy land)\s+tours?|tour (company|agency))\b|טיולים|סיורים|экскурси|туры\b/i;

/** Tripadvisor / Google categories of sellers and lodging (activities are checked first). */
const COMPANY_CATEGORY =
  /\b(travel agenc\w*|tour operators?|tour agency|transportation|taxis?|shuttles?|lodging|accommodation|bed (&|and) breakfast|guest ?house|hostel|private tours|multi-?day tours|day trips|bus tours|sightseeing tours|walking tours|cultural tours|historical (&|and) heritage tours|city tours|food tours|wine tours|tours|traveler resources|traveller resources|visitor cent(er|re)s?|tourist information)\b/i;

/** A description in the first person ("We are a family business…", "our guides"). */
const SELF_DESCRIPTION =
  /\bwe (are|offer|provide|organi[sz]e|specialize|specialise|run|will)\b|home away from home|\byour (stay|visit to our|guide)\b|\bour (rooms|suites|apartments|hotel|guest ?house|hostel|guests)\b|\bguide and historian\b|\b(licensed|certified|official|private) (tour |city )?guide\b|\bour (company|team|tours|guides|clients|customers|guests|drivers)\b|\btour operator\b|\btravel agency\b|\blicensed (tour )?guides?\b|אנחנו|אנו מציעים|החברה שלנו|мы (—|-)?\s?(компания|предлагаем|организуем)|наша компания|\b(siamo|offriamo|organizziamo|proponiamo)\b|\b(la nostra|il nostro) (agenzia|azienda|società|team|staff)\b|\bi nostri (tour|clienti|viaggi|accompagnatori|ospiti)\b|\bguid[ae] (turistic[ae]|autorizzat[ae]|ufficiale) (in|di lingua) italiano\b|\b(somos|ofrecemos|organizamos|oferecemos)\b|\bnuestr[ao]s? (agencia|empresa|equipo|tours|clientes|guías)\b|\bnoss[ao]s? (agência|empresa|equipe|tours|clientes|guias)\b|\bnous (sommes|proposons|organisons)\b|\bnotre (agence|équipe|société|entreprise)\b|\bnos (circuits|clients|guides|voyageurs)\b|\bwir (sind|bieten|organisieren)\b|\bunser(e|em|en)? (team|unternehmen|reisebüro|touren|gäste|kunden|reiseleiter)\b|\bwij (zijn|bieden|organiseren)\b|\bonze (reizen|gidsen|klanten|organisatie)\b|\b(jesteśmy|oferujemy|organizujemy)\b|\bnasza firma\b|\bnasi przewodnicy\b|\bguid[ae] (autorizzat[ae]|ufficial[ei]|abilitat[ae]|turistic[ae] (autorizzat[ae]|abilitat[ae]))\b|\b(tour|visite|viaggi) guidat[ie] in (italiano|lingua italiana)\b|\bguía oficial\b|\bguide (officiel|conférencier) francophone\b|\bstaatlich geprüfte[rn]? (reiseleiter|gästeführer)\b|does not have to be difficult|a (nice|great|good|perfect|excellent) (option|choice) for (travel(l)?ers|guests|families)|\b(free (wi-?fi|parking)|24-hour front desk|room service|non-smoking rooms)\b/i;

/** The words of a real place to visit, in the languages of Firefly's countries. */
const SIGHT_WORDS =
  /museum|musée|museo|muzeum|château|chateau|castle|schloss|burg\b|hrad|zamek|kasteel|cathedral|cathédrale|kathedrale|katedr|basilic|church|église|kirche|kostel|kościół|kerk|abbey|abbaye|abtei|klášter|klasztor|abdij|monaster|synagog|mosque|moschee|temple|palace|palais|palast|palác|pałac|paleis|park|parc|garden|jardin|garten|zahrad|ogród|tuin|national park|nationalpark|reserve|ruins|ruine|archaeolog|fortress|citadel|fort\b|tower|turm|věž|wieża|toren|bridge|brücke|brug|beach|plage|strand|lake|waterfall|wasserfall|vodopád|wodospad|waterval|cave|grotte|höhle|jeskyn|jaskini|zoo|aquarium|monument|memorial|denkmal|old town|altstadt|staré město|stare miasto|square|platz|náměstí|rynek|plein|market hall|viewpoint|lookout|מוזיאון|גן לאומי|שמורת|מצודה|כנסייה|בית כנסת|מסגד|חוף|музей|замок|собор|церковь|парк|крепость|пляж/i;

/**
 * Is this listing a tour company, travel agency, transfer service or guest house rather than a
 * place to visit or an activity? Uses its name, its categories and its own description:
 * "Abboud Tours", "XY Travel", "Galilee Guest House" and "We are a family business…" are out;
 * "Jeep Tours Golan" (an activity), "Tours Cathedral" and "Bahá'í Gardens" stay.
 */
export function isOrganization(a: { name?: string; category?: unknown; description?: unknown }): boolean {
  const name = a.name ?? '';
  const category = typeof a.category === 'string' ? a.category : '';
  const description = typeof a.description === 'string' ? a.description.slice(0, 400) : '';
  // Transfers, airport shuttles and taxis are never a place to visit ("TransferAirport24").
  if (/transfer|трансфер|הסעות/i.test(`${name} ${category}`)) return true;
  if (TRANSFER_NAME.test(`${name} ${category}`) && !SIGHT_WORDS.test(name)) return true;
  if (ACTIVITY.test(`${name} ${category}`)) return false;
  if (COMPANY_NAME.test(name)) return true;
  const sightCategory = SIGHT_WORDS.test(category);
  if (TOURS_NAME.test(name)) return !SIGHT_WORDS.test(name) && !sightCategory;
  if (LODGING_NAME.test(name)) return !SIGHT_WORDS.test(name) && !sightCategory;
  if (COMPANY_CATEGORY.test(category) && !sightCategory) return true;
  return SELF_DESCRIPTION.test(description) && !sightCategory && !SIGHT_WORDS.test(name);
}

/* ---------------- places to eat are meals, not sights ---------------- */

/** Food you go to see or do (with Food chosen): markets, food halls, wineries, tastings, classes. */
const FOOD_EXPERIENCE =
  /\b(markets?|markthal|food hall|bazaar|souk|shuk|winery|wineries|vineyards?|brewery|distillery|tasting|cooking class(es)?|culinary tours?|food tours?|chocolate factory|cheese farm|tea plantation)\b|שוק|рынок/i;
/** A place describing itself as somewhere to eat ("…is an atmospheric and cozy lunchroom", "We serve…"). */
const EATERY_DESCRIPTION =
  /\b(is|was) an? ([\p{L}-]+ ){0,3}(lunchroom|caf[eé]|coffee ?(shop|bar|house)|restaurant|bakery|bistro|brasserie|tea ?room|eatery|diner)\b|\bwe serve\b|\bserving (breakfast|brunch|lunch|dinner|coffee)\b|\bbreakfast, lunch\b|\blunch and dinner\b|\bspecialty coffee\b|\bhome-?made (cakes?|pastries|pies)\b|\bour (menu|kitchen|chefs?|dishes|cakes|pastries)\b/iu;

/** Words of a place for a meal (never a sight): restaurants, lunchrooms, breakfast and lunch places. */
const MEAL_WORDS =
  /(?:^|[^\p{L}])(restaurants?|restaurace|restauracja|ristorante|lunchroom|lunch ?room|lunch|dinner|brunch|breakfast|bistro|brasserie|eatery|diner|pizzeria|trattoria|osteria|taverna|steakhouse|sushi|ramen|burgers?|kebab|falafel|hummus|food truck|grill|tapas)(?![\p{L}])|מסעדה|ресторан|столовая|餐厅/iu;
/** Words of a place centred on coffee, tea or sweets (a sight only for travellers who chose Food). */
const SWEET_WORDS =
  /(?:^|[^\p{L}])(caf[eé]s?|coffee ?(shop|bar|house|roastery)?|tea ?room|teahouse|tea house|patisserie|pâtisserie|konditorei|confiserie|bakery|bakkerij|bäckerei|cukrárna|cukiernia|ice cream|gelato|gelateria|ijssalon|chocolat\p{L}*|dessert\p{L}*|sweets?|candy|confectioner\p{L}*|cake\p{L}*|waffle\p{L}*|crêpe\p{L}*|donuts?|macarons?|juice bar)(?![\p{L}])|(?:^|[^\p{L}])(koffie|kaffee|coffee|kahve|kawa|kávé)\p{L}*|בית קפה|קונדיטוריה|גלידה|кафе|кофейн|кондитерск|пекарн|咖啡|甜品/iu;

/**
 * A place to eat or drink, and which sort: 'meal' (a lunchroom, bistro or restaurant — planned as
 * the day's lunch or dinner, never as a sight; in Enschede "De Branderie" and "Frank & Charlie"
 * were sights) or 'sweets' (a café, coffee roaster, patisserie or ice-cream parlour — a sight only
 * for travellers who chose Food). Null for everything else: markets, food halls, wineries and
 * tastings are sights, and so is a place whose name says it is one ("Museum…").
 */
export function eateryKind(a: { name?: string; category?: unknown; description?: unknown; kind?: unknown }): 'meal' | 'sweets' | null {
  const name = a.name ?? '';
  const category = typeof a.category === 'string' ? a.category : '';
  const description = typeof a.description === 'string' ? a.description.slice(0, 400) : '';
  if (FOOD_EXPERIENCE.test(`${name} ${category}`) || SIGHT_WORDS.test(name)) return null;
  const label = `${name} ${category}`;
  const meal = MEAL_WORDS.test(label) || /\b(breakfast, lunch|lunch and dinner|serving (breakfast|brunch|lunch|dinner)|is an? ([\p{L}-]+ ){0,3}(lunchroom|restaurant|bistro|brasserie|eatery|diner))\b/iu.test(description);
  if (meal) return 'meal';
  if (SWEET_WORDS.test(label) || EATERY_DESCRIPTION.test(description)) return 'sweets';
  return a.kind === 'food' ? 'meal' : null;
}

/** A place to eat or drink of either sort (see eateryKind). */
export const isEatery = (a: { name?: string; category?: unknown; description?: unknown; kind?: unknown }): boolean => eateryKind(a) !== null;

/* ---------------- people are not attractions ---------------- */

/** Head words of a description of a person, a dynasty or a tribe. */
const PERSON_WORDS =
  /\b(sultans?|sultana|kings?|queens?|emperors?|empress|pharaohs?|princes?|princess|caliphs?|emirs?|sharifs?|sheikhs?|shaykhs?|imams?|rabbis?|rebbes?|tzaddik|sages?|kabbalists?|saints?|prophets?|apostles?|popes?|bishops?|patriarchs?|marabouts?|sufis?|mystics?|scholars?|theologians?|philosophers?|poets?|writers?|novelists?|authors?|painters?|sculptors?|artists?|architects?|composers?|musicians?|singers?|actors?|actress|politicians?|statesman|president|prime minister|ministers?|generals?|admirals?|commanders?|warriors?|soldiers?|leaders?|rulers?|monarchs?|governors?|businessman|businesswoman|entrepreneurs?|footballers?|athletes?|explorers?|scientists?|physicians?|journalists?|activists?|nobleman|noblewoman|dynasty|clan|tribe|deity|goddess|god of)\b/i;

/** Words of a place in a description ("tomb of a Talmudic sage", "palace of the King of Morocco"). */
const PLACE_NOUN =
  /\b(tomb|mausoleum|shrine|grave|burial|statue|bust|monument|memorial|museum|house|home|residence|palace|castle|church|chapel|mosque|synagogue|temple|zawiya|zaouia|madrasa|medersa|school|library|garden|park|square|street|road|building|complex|fort|fortress|citadel|kasbah|ksar|riad|medina|souk|market|gate|bridge|tower|minaret|lighthouse|hall|theat(?:re|er)|hammam|bath|fountain|well|spring|site|cemetery|necropolis|ruins|quarter|district|neighbo\w*|village|town|city|hospital|station|port|harbou?r|beach|lake|cave|waterfall|valley|mountain|island|bay|dam)\b/i;

/**
 * Is this short description (Wikidata / Wikipedia) about a person rather than a place? On the
 * map a tomb or statue is sometimes linked to the person's Wikidata item, which then turned the
 * sight into "Abdallah of Morocco — Sultan of Morocco six times from 1729 to 1757".
 * "Moroccan Sufi saint" and "French painter (1840–1926)" are people; "tomb of a Talmudic sage"
 * and "royal residence of the King of Morocco" are places.
 */
export function isPersonDescription(description: string): boolean {
  const d = description.trim();
  if (!d || PLACE_NOUN.test(d)) return false;
  const head = d.split(/\s+/).slice(0, 5).join(' ');
  return PERSON_WORDS.test(head) || /\(\s*(?:c\.\s*)?\d{3,4}\s*[–—-]\s*(?:c\.\s*)?\d{3,4}\s*\)/.test(d) || /^\s*(?:born|died)\b/i.test(d);
}

/** Words of a description of something that happened (a fire, a battle, a festival season…). */
const EVENT_WORDS =
  /\b(fires?|wildfires?|bushfires?|forest fires?|earthquakes?|floods?|flooding|disasters?|catastrophe|massacres?|battles?|attacks?|bombings?|sieges?|wars?|riots?|accidents?|crash(es)?|explosions?|shootings?|incidents?|operations?|protests?|uprisings?|revolts?|rebellions?|elections?|referendum|tournaments?|championships?|seasons?|pandemics?|epidemics?|outbreaks?|hurricanes?|storms?|cyclones?|typhoons?|tsunamis?|eruptions?|shipwrecks?|derailments?|disappearance|murders?|assassinations?|hijackings?|kidnappings?|treaty|agreement|conference|summit|campaign|offensive|raid|skirmish|clash(es)?|conflict|festivals?)\b/i;

/**
 * Is this short description about something that happened rather than a place? Wikipedia's
 * map search also returns articles about events with a location — "2010 Mount Carmel forest
 * fire" became a sight. "War memorial in Haifa" and "battle site" stay places.
 */
export function isEventDescription(description: string, title = ''): boolean {
  const d = description.trim();
  if (PLACE_NOUN.test(d)) return false;
  if (EVENT_WORDS.test(d)) return true;
  // "2010 …", "1948 …" with no place word, or a title that names an event ("… forest fire").
  return /^\d{3,4}s?\b/.test(d) || (EVENT_WORDS.test(title) && !PLACE_NOUN.test(title));
}

/** Words of a place to eat, in Firefly's languages (a "Hotel X Restaurant" stays a restaurant). */
/** Names of tours, rentals and sights (never a restaurant, unless MEAL_PLACE_NAME says so too). */
const ACTIVITY_OR_SIGHT_NAME =
  /(?:^|[^\p{L}])((bike|bicycle|cycling|e-?bike|walking|food|city|boat|segway|guided|private|free|wine|beer|pub|night|history|historical|sightseeing|bus|street art|trabi) tours?|tours? (in|of|through|around|with|to|by)|tours|touren|guided|excursions?|segways?|bikes?|bicycles?|rentals?|rent a|verleih|cruises?|boat trips?|sightseeing|hop[- ]on|museums?|museo|musée|muzeum|cathedral|church|kirche|synagogue|mosque|basilica|abbey|monastery|zoo|aquarium|memorial|monument|ruins|national park)(?![\p{L}])|\p{L}+(museum|museen|kirche)(?![\p{L}])|סיור|סיורים|מוזיאון|экскурси|музей/iu;
/** Transfer services, airport shuttles and taxis (the word anywhere: "TransferAirport24"). */
const TRANSFER_NAME =
  /transfer|трансфер|הסעות|שירותי הסעה|shuttle|шаттл|(airport|flughafen|aeroporto|aéroport|aeropuerto|lotnisko|letiště|аэропорт|נמל התעופה|שדה התעופה)[\s-]*(taxis?|cabs?|cars?|limo\w*|services?|express|bus(es)?|pick-?ups?)|(?:^|[^\p{L}])(taxis?|cabs|limousines?|chauffeurs?|такси|מוניות)(?![\p{L}])/iu;
/** Lodging names in a restaurant list: a hotel, aparthotel or hostel is not a restaurant (unless its name says so). */
const LODGING_FOR_FOOD =
  /\p{L}*hotels?(?![\p{L}])|hôtel|hotel\p{L}*|(?:^|[^\p{L}])(apart-?hotels?|apartments?|appartements?|apartamentos?|residence|residenz|suites|hostels?|hostal|motels?|pension|penzion|pensjonat|albergo|guest ?houses?|b ?& ?b|bed (and|&) breakfast|inns?|lodges?|resorts?|aparts?)(?![\p{L}])|מלון|אכסניה|צימר|отель|гостиница|апарт|хостел|酒店|宾馆|旅馆/iu;
/** Words that say a place is somewhere to sit down and eat or drink. */
const MEAL_PLACE_NAME =
  /restaurant|restaurace|restauracja|ristorante|café|cafe|cafeteria|coffee|bistro|brasserie|grill|kitchen|küche|kuchnia|pizz|trattoria|osteria|taverna|tavern|diner|eatery|kantine|canteen|mensa|biergarten|beer garden|wirtshaus|gasthaus|מסעדה|בית קפה|ресторан|кафе|столовая/i;

const FOOD_WORDS =
  /restaurant|restaurace|restauracja|ristorante|café|cafe|kawiarnia|kavárna|coffee|bistro|brasserie|grill|kitchen|küche|kuchnia|pizz|sushi|ramen|burger|bakery|bäckerei|piekarnia|pekárna|trattoria|osteria|taverna|tavern|meyhane|lokanta|kebab|falafel|hummus|steak|diner|eatery|food|deli|מסעדה|מסעדת|בית קפה|קפה|ресторан|кафе|столовая|бистро/i;

/**
 * Listed as a restaurant but a service or a seller: "Sofia–Plovdiv transfer", "Galilee Tours",
 * a travel agency, a taxi. Kept when the name says it is a place to eat.
 */
export function isNotARestaurant(r: { name?: string; description?: unknown }): boolean {
  const name = r.name ?? '';
  // A tour, a rental or a sight in the restaurant list ("Guided Bike Tour In Berlin" as dinner, a
  // museum as lunch) — unless the name also says it is somewhere to eat ("Museum Café").
  if (ACTIVITY_OR_SIGHT_NAME.test(name) && !MEAL_PLACE_NAME.test(name)) return true;
  // Hotels and aparthotels are not restaurants, even when Tripadvisor also files them under food.
  if (LODGING_FOR_FOOD.test(name) && !MEAL_PLACE_NAME.test(name)) return true;
  if (TRANSFER_NAME.test(name)) return true;
  if (FOOD_WORDS.test(name)) return false;
  return COMPANY_NAME.test(name) || TOURS_NAME.test(name) || /\btransfers?\b|\btrans(port|fer)\b|airport|шаттл|трансфер|הסעות/i.test(name);
}
