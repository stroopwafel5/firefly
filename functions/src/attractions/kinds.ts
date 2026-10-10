/**
 * What kind of place an attraction is (castle, national park, museum…). Both sources map onto
 * the same kinds: Wikidata by the item's class ("instance of"), Tripadvisor by its category
 * words. The kind decides the trip types it counts for and the emoji the app shows.
 * Pure (no Firebase), unit-tested.
 */

export type Kind =
  | 'castle'
  | 'palace'
  | 'fortress'
  | 'ruins'
  | 'monument'
  | 'oldtown'
  | 'square'
  | 'bridge'
  | 'tower'
  | 'museum'
  | 'gallery'
  | 'church'
  | 'monastery'
  | 'synagogue'
  | 'mosque'
  | 'nationalpark'
  | 'reserve'
  | 'park'
  | 'garden'
  | 'lake'
  | 'waterfall'
  | 'cave'
  | 'canyon'
  | 'beach'
  | 'viewpoint'
  | 'zoo'
  | 'aquarium'
  | 'themepark'
  | 'theatre'
  | 'market'
  | 'food'
  | 'nightlife'
  | 'shopping'
  | 'spa'
  | 'rental'
  | 'other';

export type TripType = 'Family' | 'Nature' | 'History' | 'Theatre' | 'Festival' | 'Food' | 'Tour' | 'Kid Friendly';

/** The trip types each kind counts for. */
export const KIND_TYPES: Record<Kind, TripType[]> = {
  castle: ['History', 'Tour', 'Family'],
  palace: ['History', 'Tour'],
  fortress: ['History', 'Tour'],
  ruins: ['History', 'Tour'],
  monument: ['History', 'Tour'],
  oldtown: ['History', 'Tour'],
  square: ['Tour', 'History'],
  bridge: ['Tour', 'History'],
  tower: ['Tour', 'History'],
  museum: ['History', 'Family'],
  gallery: ['History'],
  church: ['History'],
  monastery: ['History'],
  synagogue: ['History'],
  mosque: ['History'],
  nationalpark: ['Nature', 'Family'],
  reserve: ['Nature'],
  park: ['Nature', 'Family', 'Kid Friendly'],
  garden: ['Nature', 'Family'],
  lake: ['Nature', 'Family'],
  waterfall: ['Nature', 'Family'],
  cave: ['Nature', 'Family'],
  canyon: ['Nature'],
  beach: ['Nature', 'Family', 'Kid Friendly'],
  viewpoint: ['Nature', 'Tour'],
  zoo: ['Family', 'Kid Friendly', 'Nature'],
  aquarium: ['Family', 'Kid Friendly'],
  themepark: ['Family', 'Kid Friendly'],
  theatre: ['Theatre'],
  market: ['Food', 'Tour'],
  food: ['Food'],
  nightlife: [],
  shopping: [],
  spa: [],
  rental: [],
  other: ['Tour'],
};

/** Not sights: never planned as attractions (food places only when the traveller chose Food). */
export const NOT_A_SIGHT: ReadonlySet<Kind> = new Set<Kind>(['nightlife', 'shopping', 'spa', 'rental']);

/**
 * Wikidata classes (P31 "instance of") → kind. Only direct instances are matched (no subclass
 * walk, which is too slow on the public endpoint), so the common specific classes are listed.
 * Earlier entries win when an item has several classes.
 */
export const WIKIDATA_CLASSES: Array<[string, Kind]> = [
  ['Q46169', 'nationalpark'], // national park
  ['Q34038', 'waterfall'], // waterfall
  ['Q35509', 'cave'], // cave
  ['Q150784', 'canyon'], // canyon
  ['Q23397', 'lake'], // lake
  ['Q40080', 'beach'], // beach
  ['Q179049', 'reserve'], // nature reserve
  ['Q6017969', 'viewpoint'], // scenic viewpoint
  ['Q43501', 'zoo'], // zoo
  ['Q2281788', 'aquarium'], // public aquarium
  ['Q194195', 'themepark'], // amusement park
  ['Q2416723', 'themepark'], // theme park
  ['Q167346', 'garden'], // botanical garden
  ['Q1107656', 'garden'], // garden
  ['Q22698', 'park'], // park
  ['Q23413', 'castle'], // castle
  ['Q751876', 'castle'], // château
  ['Q16560', 'palace'], // palace
  ['Q57821', 'fortress'], // fortification
  ['Q1785071', 'fortress'], // fort
  ['Q839954', 'ruins'], // archaeological site
  ['Q109607', 'ruins'], // ruins
  ['Q2065736', 'ruins'], // Roman amphitheatre
  ['Q54831', 'ruins'], // amphitheatre
  ['Q676050', 'oldtown'], // old town
  ['Q174782', 'square'], // square
  ['Q12280', 'bridge'], // bridge
  ['Q12518', 'tower'], // tower
  ['Q4989906', 'monument'], // monument
  ['Q5003624', 'monument'], // memorial
  ['Q483453', 'monument'], // fountain
  ['Q756102', 'museum'], // open-air museum
  ['Q588140', 'museum'], // science museum
  ['Q33506', 'museum'], // museum
  ['Q207694', 'gallery'], // art museum
  ['Q1007870', 'gallery'], // art gallery
  ['Q2977', 'church'], // cathedral
  ['Q163687', 'church'], // basilica
  ['Q16970', 'church'], // church building
  ['Q44613', 'monastery'], // monastery
  ['Q160742', 'monastery'], // abbey
  ['Q34627', 'synagogue'], // synagogue
  ['Q32815', 'mosque'], // mosque
  ['Q153562', 'theatre'], // opera house
  ['Q24354', 'theatre'], // theatre building
  ['Q1060829', 'theatre'], // concert hall
  ['Q37654', 'market'], // market
  ['Q570116', 'other'], // tourist attraction
];

const CLASS_KIND = new Map(WIKIDATA_CLASSES);
const CLASS_RANK = new Map(WIKIDATA_CLASSES.map(([q], i) => [q, i]));

export const kindOfClass = (qid: string): Kind => CLASS_KIND.get(qid) ?? 'other';
/** Lower = more specific (wins when an item has several classes). */
export const classRank = (qid: string): number => CLASS_RANK.get(qid) ?? 999;

/** Nature and heritage kinds a traveller would make a detour for (Plitvice, Bran Castle…). */
export const LANDMARK_KINDS: ReadonlySet<Kind> = new Set<Kind>([
  'nationalpark', 'reserve', 'waterfall', 'lake', 'cave', 'canyon', 'castle', 'palace', 'fortress', 'ruins', 'monastery', 'oldtown',
]);

/** Tripadvisor category words → kind (order matters: the first match wins). */
const TEXT_KINDS: Array<[RegExp, Kind]> = [
  [/bike rental|car rental|rental|equipment hire|boat rental|scooter/i, 'rental'],
  [/\bspa\b|wellness|massage|beer spa|beer bath|thermal bath|sauna/i, 'spa'],
  [/\bbars?\b|\bpubs?\b|nightlife|night club|nightclub|clubs? &|casino|lounge|cocktail/i, 'nightlife'],
  [/shopping|shop\b|shops\b|store|boutique|mall|outlet|gift|antique|flea/i, 'shopping'],
  [/restaurant|eat & drink|cafe|café|coffee|bakery|brewer|winer|distiller|food tour|tasting|cooking class|culinary/i, 'food'],
  [/national park/i, 'nationalpark'],
  [/nature (reserve|& wildlife)|wildlife area|reserve/i, 'reserve'],
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
  [/ancient ruins|ruins|archaeolog/i, 'ruins'],
  [/art museum|art gallery|gallery/i, 'gallery'],
  [/museum/i, 'museum'],
  [/synagogue/i, 'synagogue'],
  [/mosque/i, 'mosque'],
  [/monaster|abbey|convent/i, 'monastery'],
  [/church|cathedral|basilica|chapel|sacred & religious/i, 'church'],
  [/theat|theater|opera|concert hall|ballet|performance/i, 'theatre'],
  [/market/i, 'market'],
  [/garden/i, 'garden'],
  [/park/i, 'park'],
  [/observation deck|viewpoint|lookout|scenic/i, 'viewpoint'],
  [/tower/i, 'tower'],
  [/bridge/i, 'bridge'],
  [/historic district|old town|neighbo/i, 'oldtown'],
  [/square|plaza/i, 'square'],
  [/monument|memorial|statue|fountain|landmark/i, 'monument'],
];

export function kindFromText(text: string): Kind {
  for (const [re, kind] of TEXT_KINDS) if (re.test(text)) return kind;
  return 'other';
}
