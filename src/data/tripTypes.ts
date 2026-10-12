import { EventType } from '../models';

/**
 * Pictures for the trip-type picker. They are NOT stock or AI "concept" images: each type
 * shows the lead photograph of a real, named place from its Wikipedia article (fetched at
 * runtime through the Wikipedia REST API, which returns the photo and its article URL).
 * Candidates are tried in order; only JPEG photographs are accepted (no SVG logos or maps).
 */
export const TYPE_PHOTO_ARTICLES: Record<EventType, string[]> = {
  Nature: ['Black Forest', 'Białowieża Forest', 'Plitvice Lakes National Park'],
  History: ['Neuschwanstein Castle', 'Bran Castle', 'Prague Castle'],
  Theatre: ['Estates Theatre', 'Vienna State Opera', 'Palais Garnier'],
  Festival: ['Oktoberfest', 'Notting Hill Carnival', 'Up Helly Aa'],
  Food: ['Mahane Yehuda Market', 'Borough Market', 'Naschmarkt'],
  Tour: ['Charles Bridge', 'Old Town Square', 'Royal Mile'],
  Family: ['Tivoli Gardens', 'Efteling', 'Europa-Park'],
  'Kid Friendly': ['Playground', 'Prague Zoo', 'Legoland Billund Resort'],
  Shopping: ['Galleria Vittorio Emanuele II', 'Grand Bazaar, Istanbul', 'Harrods'],
  Beaches: ['Navagio', 'Whitehaven Beach', 'Praia da Marinha'],
  'Extreme Sport': ['Paragliding', 'Bungee jumping', 'Whitewater rafting'],
  'Night Clubs': ['Nightclub', 'Ministry of Sound', 'Berghain'],
};

/** Icon (MaterialCommunityIcons) per type, shown while the photo loads or offline. */
export const TYPE_ICONS: Record<EventType, string> = {
  Family: 'account-group',
  Nature: 'pine-tree',
  History: 'castle',
  Theatre: 'drama-masks',
  Festival: 'party-popper',
  Food: 'silverware-fork-knife',
  Tour: 'walk',
  'Kid Friendly': 'teddy-bear',
  Shopping: 'shopping',
  Beaches: 'beach',
  'Extreme Sport': 'parachute',
  'Night Clubs': 'glass-cocktail',
};

/**
 * TripAdvisor subcategory keywords → our types. Used to tag attractions and to rank them
 * against the types the traveller picked.
 */
export const TA_KEYWORDS: Record<EventType, RegExp> = {
  Nature: /nature|park|garden|beach|lake|mountain|hik|waterfall|forest|canyon|cave|scenic|national park/i,
  History: /histor|castle|palace|fort|monument|ruin|museum|church|cathedral|monaster|memorial|ancient|archae|heritage|synagogue|temple/i,
  Theatre: /theat|theater|opera|concert|show|performance|cinema|ballet/i,
  Festival: /festival|event|market|fair|nightlife|bar|club/i,
  Food: /food|market|culinary|winer|brewer|tasting|cooking|cafe|bakery/i,
  Tour: /tour|walking|sightseeing|landmark|point of interest|bridge|square|neighbo|observation|viewpoint/i,
  Family: /zoo|aquarium|amusement|theme park|water park|playground|game|family|science|interactive/i,
  'Kid Friendly': /zoo|aquarium|amusement|theme park|water park|playground|children|kids|science|interactive|farm/i,
  Shopping: /shopping|\bshops?\b|mall|market|boutique|outlet|bazaar|souvenir|department store|flea/i,
  Beaches: /beach|\bbay\b|coast|seaside|shore|lagoon/i,
  'Extreme Sport': /zip ?-?line|bungee|sky ?div|paraglid|parasail|rafting|canyoning|\batv\b|quad|off-?road|4x4|jeep|climb|via ferrata|surf|kite|wakeboard|scuba|diving|kart|paintball|rope park|adventure|ski\b|snowboard|sandboard|jet ?ski|adrenaline|extreme/i,
  'Night Clubs': /night ?club|nightlife|\bclubs?\b|disco|dance club|\bbars?\b|lounge|cocktail/i,
};
