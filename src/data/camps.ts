import { L, Lang, LocalizedText, pick } from '../i18n/localized';
import { Camp, CampPage, DEFAULT_PROVIDER, PhotoSource } from '../models';
import * as IT from './campItineraries';

/**
 * Different Route camps, taken from www.differentroute.net (homepage cards + each camp page),
 * read on 9 Oct 2026; Hebrew texts updated to the site's exact wording on 10 Oct 2026 where the
 * page could be read (the site is Hebrew-only, so English and Russian are translations of it). Photos are the site's own images on static.wixstatic.com; each
 * photo's source page is the page it appears on. Prices are "from" prices in euro and exclude
 * flights and mandatory insurance, as the site states.
 *
 * The Cloud Function `syncCamps` re-checks every camp page daily and flags pages that
 * disappear (see functions/src/camps.ts), and admins can edit camps in Firestore; this file
 * is the seed and the offline fallback.
 */

const SITE = 'https://www.differentroute.net';
export const BOOKING_FORM_URL = 'https://form.jotform.com/262433669352462';

/** The original image on Wix. */
export function wixImage(file: string): string {
  return `https://static.wixstatic.com/media/${file}`;
}
/** A resized/cropped rendition (Wix image service), for list thumbnails. */
export function wixThumb(file: string, w = 800, h = 450): string {
  return `https://static.wixstatic.com/media/${file}/v1/fill/w_${w},h_${h},al_c,q_80/${file}`;
}

export interface CampData {
  id: number;
  slug: string;
  name: LocalizedText;
  location: LocalizedText;
  country: string;
  startDate: string;
  endDate: string;
  minAge: number;
  maxAge: number;
  price: number;
  /** Camp page on differentroute.net (or the camps listing when the camp has no page). */
  link: string;
  /** Whether `link` is the camp's own page. */
  hasOwnPage: boolean;
  /** Exact option text in the JotForm "Which camp would you like to join?" field. */
  bookingOption: string;
  /** Photos: [file, page it appears on]. First one is the card image. */
  photos: Array<[string, string]>;
  shortDescription: LocalizedText;
  pageDescription: LocalizedText;
  itinerary: LocalizedText[];
  itineraryNote?: LocalizedText;
  /** Who runs the camp; missing = Different Route. */
  provider?: string;
  /** Disabilities the camp supports (see models/Accessibility.ts); missing = none yet. */
  disability?: string[];
}

const INCLUDED: LocalizedText[] = [
  L('All activities and lessons in the program', 'כל הפעילויות והשיעורים שבתוכנית', 'Все занятия и мероприятия программы'),
  L('Accommodation at the camp in a shared room', 'לינה בשטח המחנה בחדר משותף', 'Проживание в лагере в общей комнате'),
  L('Three meals a day + evening snacks', 'שלוש ארוחות ביום + נשנושים בערב', 'Трёхразовое питание + вечерний перекус'),
  L('All tours listed in the itinerary', 'כל הסיורים המצוינים בתוכנית', 'Все экскурсии, указанные в программе'),
];
export const NOT_INCLUDED = L(
  'Flights and mandatory travel insurance are not included.',
  'המחיר אינו כולל טיסה וביטוח חובה.',
  'Перелёт и обязательная страховка в стоимость не входят.',
);

const UK_NOTE = L(
  'differentroute.net publishes a typical week for the UK camps; the rest of the program follows the same pattern with different tours.',
  'באתר מופיע שבוע ממוצע במחנות בבריטניה; שאר התוכנית בנויה באותה מתכונת עם סיורים אחרים.',
  'На сайте опубликована типичная неделя британских лагерей; остальная программа строится так же, с другими экскурсиями.',
);

const ENGLAND_SHORT = L(
  "Everyone knows English summer schools — ours add activities, adventures and tours to English lessons with certified native-speaking teachers, so you get to know the real England!",
  'סאמר סקולים באנגליה כולנו מכירים, אבל בשלנו מעבר ללימודי אנגלית עם מורים מוסמכים דוברי שפת אם תמצאו גם פעילויות, הרפתקאות וסיורים שבהם תוכלו להכיר את אנגליה האמיתית!',
  'Летние школы в Англии знают все, но у нас, кроме английского с дипломированными носителями языка, есть активности, приключения и экскурсии, чтобы узнать настоящую Англию!',
);

const PRAGUE_SHORT = L(
  'A special summer school with English teachers from Oxford, unique activities and tours, and friends from all over the world.',
  'סאמר סקול מיוחד עם מורים לאנגלית מאוקספורד, פעילויות וסיורים מיוחדים וחברים מכל העולם.',
  'Особая летняя школа с преподавателями английского из Оксфорда, необычными занятиями и экскурсиями и друзьями со всего мира.',
);
const PRAGUE_PAGE = L(
  'Ancient legends, Jewish heritage, fun and lots of water — all in one special city. The camp is on the Prague university campus, 10 minutes by tram from the centre. Groups of 10–15 teens by age and English level, two per room; the camp runs in English with Hebrew-speaking counselors on site.',
  'אגדות עתיקות, מורשת יהודית, כיף והרבה מים – והכל בעיר אחת מיוחדת. המחנה ממוקם בשטח אוניברסיטת פראג, 10 דקות בטראם ממרכז העיר. קבוצות של 10–15 בני נוער לפי גיל ורמת אנגלית, שניים בחדר; המחנה מתנהל באנגלית עם מדריכים דוברי עברית בשטח.',
  'Древние легенды, еврейское наследие, веселье и много воды — и всё это в одном особенном городе. Лагерь находится в кампусе пражского университета, в 10 минутах на трамвае от центра. Группы по 10–15 подростков по возрасту и уровню английского, по двое в комнате; язык лагеря — английский, на месте есть вожатые, говорящие на иврите.',
);

export const CAMPS: CampData[] = [
  {
    id: 1,
    slug: 'china-summer',
    name: L('Summer Camp in China', 'מחנה קיץ בסין', 'Летний лагерь в Китае'),
    location: L('Luoyang, Henan', 'לואויאנג, חנאן', 'Лоян, Хэнань'),
    country: 'CN',
    startDate: '2027-07-07',
    endDate: '2027-07-21',
    minAge: 12,
    maxAge: 18,
    price: 2200,
    link: `${SITE}/china-summer`,
    hasOwnPage: true,
    bookingOption: 'Summer Camp in China, Henan (7-21/07, 9-23/08)',
    photos: [
      ['8d160b_e941d6be620e431cbe5a65c7787b06b6~mv2.png', SITE],
      ['8d160b_eceb8da1ed6d451499b2abf90438c270~mv2.webp', `${SITE}/china-summer`],
    ],
    shortDescription: L(
      'Looking for a different kind of summer camp? Hike in the mountains, make friends, visit temples and learn about kung fu, Chinese food and traditional graffiti — this camp is for you.',
      'מחפשים מחנה קיץ קצת שונה? רוצים לטייל בהרים, להכיר חברים, לבקר במקדשים וללמוד על קונג פו, אוכל סיני וגרפיטי מסורתי? זה המחנה בשבילכם.',
      'Ищете необычный летний лагерь? Походы в горы, новые друзья, храмы, кунг-фу, китайская кухня и традиционные граффити — этот лагерь для вас.',
    ),
    pageDescription: L(
      "Want a different kind of summer camp? A place full of adventures where you can get to know an ancient, mysterious culture and visit temples and the most beautiful natural sites in the world? China is the camp for you!\n\nThe camp is in Luoyang, in a hotel partly rented for our group; groups of 10–15 teens, 2–4 per room. Morning activities can be swapped for Chinese lessons at extra cost.",
      "רוצים מחנה קיץ מסוג אחר? מקום עם הרפתקאות שבו תוכלו להכיר תרבות עתיקה ומסתורית ולבקר במקדשים ואתרי הטבע היפים בעולם? סין הוא המחנה בשבילכם!\n\nהמחנה בעיר לואויאנג, בבית מלון שחלקו מושכר לקבוצה; קבוצות של 10–15 בני נוער, 2–4 בחדר. אפשר להחליף את פעילויות הבוקר בלימוד סינית בתשלום נוסף.",
      "Хотите летний лагерь другого формата? Место, полное приключений, где можно познакомиться с древней загадочной культурой и побывать в храмах и самых красивых природных местах мира? Китай — это лагерь для вас!\n\nЛагерь в Лояне, в отеле, часть которого арендована для группы; группы по 10–15 подростков, 2–4 в комнате. Утренние занятия можно заменить китайским языком за доплату.",
    ),
    itinerary: IT.CHINA,
  },
  {
    id: 2,
    slug: 'minsk-camp',
    name: L('Summer Camp in Belarus', 'מחנה קיץ בבלרוס', 'Летний лагерь в Беларуси'),
    location: L('Dokora, near Minsk', 'דוקורה, ליד מינסק', 'Докора, под Минском'),
    country: 'BY',
    startDate: '2027-07-10',
    endDate: '2027-07-24',
    minAge: 12,
    maxAge: 18,
    price: 1200,
    link: `${SITE}/minsk-camp`,
    hasOwnPage: true,
    bookingOption: 'Summer Camp in Belarus (10-24/07)',
    photos: [
      ['8d160b_4b7b037f86d7465f9de5e868b9b3f6f7~mv2.png', SITE],
      ['8d160b_c426fca32ec14375948fde546d9bb635~mv2.webp', `${SITE}/minsk-camp`],
      ['8d160b_e71a1e56107547258c6a413b7dfff1fb~mv2.webp', `${SITE}/minsk-camp`],
      ['8d160b_56523c8bcb1b4a22a7610f32f10e742a~mv2.webp', `${SITE}/minsk-camp`],
      ['8d160b_1c34d914885b45de8457ccca7062814a~mv2.webp', `${SITE}/minsk-camp`],
      ['8d160b_401f4f21ef3848e5b3e7b68bb32b802c~mv2.webp', `${SITE}/minsk-camp`],
    ],
    shortDescription: L(
      "14 days full of sport, adventures, learning and new friends",
      "14 ימים מלאים בספורט, הרפתקאות, לימודים וחברים חדשים",
      "14 дней, полных спорта, приключений, учёбы и новых друзей",
    ),
    pageDescription: L(
      "Want to visit a country most of your friends have never heard of? Make new friends, hike through dense forests and special cities and get to know a different culture? This is the perfect place for you!\n\nThe camp is bilingual — it runs in Hebrew and Russian.\nThe camp is at a site with 3-star hotel conditions in the town of Dokora.\nEach group has about 10–15 teens, divided by age.\nEvery 2 teens get a room with an en-suite bathroom.",
      "רוצים לבקר במדינה שרוב החברים שלכם לא שמעו עליה? להכיר חברים חדשים, לטייל ביערות עבותים, בערים מיוחדות ולהכיר תרבות שונה? זהו המקום המושלם בשבילכם!\n\nהמחנה הינו דו לשוני - ומתנהל בעברית וברוסית.\nהמחנה ממוקם במחנה בתנאי מלון 3 כוכבים בעיר דוקורה.\nבכל קבוצה יש כ10-15 בני נוער שמחולקים לפי גיל.\nכל 2 בני נוער מקבלים חדר עם שירותים צמודים.",
      "Хотите побывать в стране, о которой большинство ваших друзей даже не слышали? Найти новых друзей, гулять по густым лесам и необычным городам и познакомиться с другой культурой? Это идеальное место для вас!\n\nЛагерь двуязычный — проходит на иврите и русском.\nЛагерь расположен на территории с условиями отеля 3 звезды в городке Докора.\nВ каждой группе около 10–15 подростков, разделённых по возрасту.\nКаждые 2 подростка получают комнату с собственным санузлом.",
    ),
    itinerary: IT.BELARUS,
  },
  {
    id: 3,
    slug: 'macedonia-camp',
    name: L('Summer Camp in North Macedonia', 'מחנה קיץ במקדוניה', 'Летний лагерь в Северной Македонии'),
    location: L('Lake Ohrid', 'אגם אוחריד', 'Охридское озеро'),
    country: 'MK',
    startDate: '2027-07-19',
    endDate: '2027-08-02',
    minAge: 10,
    maxAge: 18,
    price: 1300,
    link: `${SITE}/macedonia-camp`,
    hasOwnPage: true,
    bookingOption: 'Summer Camp in North Macedonia, Ohrid (19/07-2/08)',
    photos: [
      ['8d160b_4200b5ffecb54d298ab43d9a89725777~mv2.png', SITE],
      ['8d160b_56e790f38d9a4b37b524c60c30344e0d~mv2.webp', `${SITE}/macedonia-camp`],
      ['8d160b_a1730491b5ad4b62a066141d8f6faa34~mv2.webp', `${SITE}/macedonia-camp`],
      ['8d160b_46633c123d1949b5922f77dfb2f2390e~mv2.webp', `${SITE}/macedonia-camp`],
      ['8d160b_ad30f01f13da4851be1af1e313a978c0~mv2.webp', `${SITE}/macedonia-camp`],
      ['8d160b_873272135b1746d38a5449b1d98d3695~mv2.webp', `${SITE}/macedonia-camp`],
    ],
    shortDescription: L(
      "A special summer school, full of adventures, fun and water at one of the most beautiful lakes in Europe",
      "סאמר סקול מיוחד, מלא בהרפתקאות, כיף ומים באחד מהאגמים היפים באירופה",
      "Особая летняя школа, полная приключений, веселья и воды, на одном из самых красивых озёр Европы",
    ),
    pageDescription: L(
      "Love water, nature and ancient cultures? Come spend the summer with new friends and join the adventures at the most secret — and one of the most beautiful — lakes in Europe!\n\nThe camp runs in English; if needed, Hebrew-speaking counselors from Israel are on site and can put children and parents in touch.\nThe camp is in a traditional holiday village on the shore of Lake Ohrid, about 15 minutes from the town itself.\nEach group has about 10–15 teens, divided by age.\nEvery 2 teens get a room with an en-suite bathroom.",
      "אוהבים מים, טבע ותרבויות עתיקות? בואו לבלות את הקיץ עם חברים חדשים ולהצטרף להרפתקאות באגם הסודי ביותר, ואחד מהיפים ביותר באירופה!\n\nהמחנה מתנהל באנגלית, במקרה הצורך יש בשטח המחנה מדריכים דוברי עברית מהארץ, שיכולים במידת הצורך ליצור קשר בין הילדים להורים.\nהמחנה ממוקם בכפר נופש מסורתי על גדות אגם אוחריד, במרחק כ15 דקות מהעיר עצמה.\nבכל קבוצה יש כ10-15 בני נוער שמחולקים לפי גיל.\nכל 2 בני נוער מקבלים חדר עם שירותים צמודים.",
      "Любите воду, природу и древние культуры? Проведите лето с новыми друзьями и отправляйтесь навстречу приключениям на самом тайном — и одном из самых красивых — озере Европы!\n\nЯзык лагеря — английский; при необходимости на месте есть ивритоязычные вожатые из Израиля, которые помогут связаться детям и родителям.\nЛагерь расположен в традиционной туристической деревне на берегу Охридского озера, примерно в 15 минутах от самого города.\nВ каждой группе около 10–15 подростков, разделённых по возрасту.\nКаждые 2 подростка получают комнату с собственным санузлом.",
    ),
    itinerary: IT.MACEDONIA,
  },
  {
    id: 4,
    slug: 'england-camp-kent',
    name: L('Summer School in England (2.5 weeks)', 'סאמר סקול באנגליה (2.5 שבועות)', 'Летняя школа в Англии (2,5 недели)'),
    location: L('Kent College, Pembury', 'קנט קולג׳, פמברי', 'Kent College, Пембери'),
    country: 'GB',
    startDate: '2027-07-21',
    endDate: '2027-08-08',
    minAge: 12,
    maxAge: 18,
    price: 2800,
    link: `${SITE}/england-camp`,
    hasOwnPage: true,
    bookingOption: 'Summer Camp in UK, England (2.5 weeks 21/07-8/08)',
    photos: [
      ['8d160b_becaa749a31d4ff09a389f414f5f5185~mv2.png', SITE],
      ['8d160b_62566ae230364f7198d91f5f63b12473~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_5e79ef0615a04235912163b29a1bd15d~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_933d1a2e10c9408c9e8de8a44761a3ef~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_d0958107fb17446dbd31bafdbb633197~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_667b039506734fba8533461df8b1557f~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_68464287e46c4c84b8015e783b1c5316~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_6cfef68a19ff40c6ba3dbf8a1076fe3b~mv2.webp', `${SITE}/england-camp`],
    ],
    shortDescription: ENGLAND_SHORT,
    pageDescription: L(
      "You've surely heard of summer schools in England! But our camps are much more than that.\nAt the summer camps we offer you don't only enjoy challenging activities and facilities — you also learn English with experienced native-speaking teachers and discover amazing, lesser-known places in one of the most beautiful countries in the world.\n\nThe camp runs in English, and Hebrew-speaking counselors from Israel travel with the group.\nIn Britain we have 3 different camps — one in Kent, one near London and one in Scotland! Each has 4-star hotel conditions, activities, 3 meals included and even a pool on site.\nEach group has about 10–15 teens, divided by age.\nEvery 2 teens get a room with an en-suite bathroom.",
      "על מחנות סאמר סקול באנגליה בוודאי כבר שמעתם! אבל המחנות שלנו הם הרבה יותר מזה.\nבמחנות הקיץ שאנו מציעים אפשר לא רק להנות מפעילויות ומתקנים אתגריים, אלא גם ללמוד אנגלית עם מורים מנוסים דוברי אנגלית כשפת אם ולגלות מקומות מדהימים ופחות מוכרים באחת המדינות היפות בעולם.\n\nהמחנה מתנהל בשפה האנגלית, אך מתלווים לקבוצה מדריכים דוברי עברית מהארץ.\nבבריטניה יש לנו 3 מחנות שונים - אחד במחוז קנט, אחד ליד לונדון ואחד בסקוטלנד! בכל אחד מהם יש תנאים של מלון 4 כוכבים, פעילויות, 3 ארוחות כלולות ואף בריכה צמודה.\nבכל קבוצה יש כ10-15 בני נוער שמחולקים לפי גיל.\nכל 2 בני נוער מקבלים חדר עם שירותים צמודים.",
      "О летних школах в Англии вы наверняка уже слышали! Но наши лагеря — это гораздо больше.\nВ наших летних лагерях можно не только наслаждаться захватывающими занятиями и площадками, но и учить английский с опытными преподавателями — носителями языка и открывать удивительные, малоизвестные места в одной из самых красивых стран мира.\n\nЯзык лагеря — английский, с группой едут ивритоязычные вожатые из Израиля.\nВ Великобритании у нас 3 разных лагеря — в графстве Кент, под Лондоном и в Шотландии! В каждом — условия отеля 4 звезды, занятия, трёхразовое питание и даже свой бассейн.\nВ каждой группе около 10–15 подростков, разделённых по возрасту.\nКаждые 2 подростка получают комнату с собственным санузлом.",
    ),
    itinerary: IT.UK_TYPICAL_WEEK,
    itineraryNote: UK_NOTE,
  },
  {
    id: 5,
    slug: 'armenia-camp',
    name: L('Summer Camp in Armenia', 'מחנה קיץ בארמניה', 'Летний лагерь в Армении'),
    location: L('Armenia', 'ארמניה', 'Армения'),
    country: 'AM',
    startDate: '2027-07-31',
    endDate: '2027-08-12',
    minAge: 12,
    maxAge: 18,
    price: 1350,
    link: `${SITE}`,
    hasOwnPage: false,
    bookingOption: 'Summer Camp in Armenia (31/07-12/08)',
    photos: [['8d160b_2a9b7879dd1b4028ad7ce6355cccf9d0~mv2.png', SITE]],
    shortDescription: L(
      "Love nature, adventures, adrenaline, mountains and lakes? Join a journey that is much more than an ordinary summer camp",
      "אוהבים טבע, הרפתקאות, אנדרנלין, הרים ואגמים? הצטרפו למסע שהוא הרבה מעבר למחנה קיץ רגיל",
      "Любите природу, приключения, адреналин, горы и озёра? Присоединяйтесь к путешествию, которое гораздо больше, чем обычный летний лагерь",
    ),
    pageDescription: L(
      'Love nature, adventure, adrenaline, mountains and lakes? Join a journey that goes far beyond an ordinary summer camp.',
      'אוהבים טבע, הרפתקאות, אדרנלין, הרים ואגמים? הצטרפו למסע שהוא הרבה מעבר למחנה קיץ רגיל.',
      'Любите природу, приключения, адреналин, горы и озёра? Присоединяйтесь к путешествию, которое намного больше обычного лагеря.',
    ),
    itinerary: [],
  },
  {
    id: 6,
    slug: 'japan-camp',
    name: L('Summer School in Japan', 'סאמר סקול ביפן', 'Летняя школа в Японии'),
    location: L('Sapporo, Hokkaido', 'סאפורו, הוקאידו', 'Саппоро, Хоккайдо'),
    country: 'JP',
    startDate: '2027-08-12',
    endDate: '2027-08-26',
    minAge: 12,
    maxAge: 18,
    price: 3800,
    link: `${SITE}/japan-camp`,
    hasOwnPage: true,
    bookingOption: 'Summer Camp in Japan (12-26/08)',
    photos: [
      ['8d160b_ddd77f3e76b34ebe98c3a9feb278056d~mv2.png', SITE],
      ['8d160b_afd2ac22b46c4d24850339d412cc6524~mv2.webp', `${SITE}/japan-camp`],
      ['8d160b_dacd24f5a0504141b0b8cec7c1a7d21e~mv2.webp', `${SITE}/japan-camp`],
      ['8d160b_ad4d4ddb7aa44899af1423bead51d535~mv2.webp', `${SITE}/japan-camp`],
      ['8d160b_04894ee101ab4cba95c06a818396e4a0~mv2.webp', `${SITE}/japan-camp`],
      ['8d160b_6fa84b467a904c4999ccaa0cc8064afa~mv2.webp', `${SITE}/japan-camp`],
    ],
    shortDescription: L(
      'Love anime, manga and sushi? Want to learn Japanese or simply discover a different culture among temples, mountains and modern cities? Our camp in Sapporo is perfect for you!',
      'אוהבים אנימה, מנגה וסושי? רוצים ללמוד יפנית או סתם להכיר תרבות שונה ולטייל בין מקדשים, הרים וערים מודרניות? המחנה שלנו בסאפורו מושלם עבורכם!',
      'Любите аниме, мангу и суши? Хотите выучить японский или просто открыть другую культуру среди храмов, гор и современных городов? Наш лагерь в Саппоро — для вас!',
    ),
    pageDescription: L(
      "Love anime? Dream of learning Japanese, understanding series, or \"just\" getting to know a new and fascinating culture, visiting temples and mountains and discovering a completely different way of life? Our camp in Sapporo is exactly for you!\n\nThe camp runs in English, and a dedicated Hebrew-speaking counselor travels with the group.\nThe camp is in a university hotel in beautiful Sapporo, in the heart of the island of Hokkaido — the northern, mountainous part and one of the most beautiful in Japan.\nEach group has about 10–15 teens, divided by age.\nEvery 2 teens get a room with an en-suite bathroom.\nYou learn Japanese with professional native-speaking teachers.",
      "אוהבים אנימה? חולמים ללמוד יפנית, להבין סדרות או \"סתם\" להכיר תרבות חדשה ומרתקת, לבקר במקדשים והרים ולהכיר אורח חיים שונה לחלוטין? המחנה שלנו בסאפורו הוא בדיוק בשבילכם!\n\nהמחנה מתנהל באנגלית, וביחד עם הקבוצה יוצא מדריך צמוד דובר עברית.\nהמחנה ממוקם במלון אוניברסיטאי בסאפורו היפה שבמרכז האי הוקאידו - החלק הצפוני, ההרי ואחד מהיפים ביותר ביפן.\nבכל קבוצה יש כ10-15 בני נוער שמחולקים לפי גיל.\nכל 2 בני נוער מקבלים חדר עם שירותים צמודים.\nלומדים יפנית יחד עם מורים מקצועים דוברי שפת אם.",
      "Любите аниме? Мечтаете выучить японский, понимать сериалы или «просто» познакомиться с новой увлекательной культурой, побывать в храмах и горах и узнать совсем другой образ жизни? Наш лагерь в Саппоро — именно для вас!\n\nЯзык лагеря — английский, с группой едет персональный вожатый, говорящий на иврите.\nЛагерь расположен в университетском отеле в красивом Саппоро, в центре острова Хоккайдо — северной, горной и одной из самых красивых частей Японии.\nВ каждой группе около 10–15 подростков, разделённых по возрасту.\nКаждые 2 подростка получают комнату с собственным санузлом.\nЯпонский учат с профессиональными преподавателями — носителями языка.",
    ),
    itinerary: IT.JAPAN,
  },
  {
    id: 7,
    slug: 'prague-camp-july',
    name: L('Summer School in Prague (July)', 'סאמר סקול בפראג (יולי)', 'Летняя школа в Праге (июль)'),
    location: L('Prague', 'פראג', 'Прага'),
    country: 'CZ',
    startDate: '2027-07-08',
    endDate: '2027-07-21',
    minAge: 10,
    maxAge: 18,
    price: 1550,
    link: `${SITE}/prague-camp`,
    hasOwnPage: true,
    bookingOption: 'Summer Camp in Czesh Republic, Prague (8-21/07, 9-22/08)',
    photos: [
      ['8d160b_1a03afc2db2848f4be6b7bba276171c2~mv2.jpeg', SITE],
      ['8d160b_b296ad887721479bb51a456ed6f52a16~mv2.jpeg', `${SITE}/prague-camp`],
    ],
    shortDescription: PRAGUE_SHORT,
    pageDescription: PRAGUE_PAGE,
    itinerary: IT.PRAGUE,
  },
  {
    id: 8,
    slug: 'moldova-camp',
    name: L('Summer Camp in Moldova', 'מחנה קיץ במולדובה', 'Летний лагерь в Молдове'),
    location: L('Near Chișinău', 'ליד קישינב', 'Под Кишинёвом'),
    country: 'MD',
    startDate: '2027-07-12',
    endDate: '2027-07-26',
    minAge: 11,
    maxAge: 17,
    price: 1200,
    link: `${SITE}/moldova-camp`,
    hasOwnPage: true,
    bookingOption: 'Summer Camp in Moldova (12-26/07)',
    photos: [
      ['8d160b_3d93f23ef7ad48eb80eb1b2f0cc35456~mv2.png', SITE],
      ['8d160b_fb27da4bc62e4df484232b28923d64ca~mv2.webp', `${SITE}/moldova-camp`],
      ['8d160b_93caf212cd3044efb35ff76c2c449cc1~mv2.webp', `${SITE}/moldova-camp`],
      ['8d160b_af6cd5071942422ba179474bda244028~mv2.webp', `${SITE}/moldova-camp`],
      ['8d160b_9184dc407c034a6a891b39df729eacc4~mv2.webp', `${SITE}/moldova-camp`],
      ['8d160b_816f685c289b4aa1ac5429d6f9d10e35~mv2.webp', `${SITE}/moldova-camp`],
    ],
    shortDescription: L(
      "Discover the most secret and special country in Europe and set off on adventures with new friends from Israel and around the world",
      "גלו את המדינה הכי סודית ומיוחדת באירופה וצאו להרתפקאות יחד עם חברים חדשים מרחבי הארץ והעולם",
      "Откройте самую тайную и особенную страну Европы и отправляйтесь навстречу приключениям с новыми друзьями из Израиля и со всего мира",
    ),
    pageDescription: L(
      'Visit a country most of your friends have never heard of, hike through thick forests, explore special cities and get to know a different culture. The camp is bilingual (Hebrew and Russian) and stays at a high-standard camp right next to the capital, Chișinău; two teens per room with en-suite bathroom.',
      'רוצים לבקר במדינה שרוב החברים שלכם לא שמעו עליה, לטייל ביערות עבותים ובערים מיוחדות ולהכיר תרבות שונה? המחנה דו-לשוני (עברית ורוסית) ומתקיים במחנה ברמה גבוהה ממש ליד הבירה קישינב; שני בני נוער בחדר עם שירותים צמודים.',
      'Страна, о которой не слышали ваши друзья, густые леса, особенные города и другая культура. Лагерь двуязычный (иврит и русский), проживание в лагере высокого уровня рядом со столицей, Кишинёвом; по двое в комнате с удобствами.',
    ),
    itinerary: IT.MOLDOVA,
  },
  {
    id: 9,
    slug: 'scotland-camp',
    name: L('Summer School in Scotland (3 weeks)', 'סאמר סקול בסקוטלנד (3 שבועות)', 'Летняя школа в Шотландии (3 недели)'),
    location: L('Strathallan School, Scotland', 'בית הספר סטרתאלן, סקוטלנד', 'Strathallan School, Шотландия'),
    country: 'GB',
    startDate: '2027-07-21',
    endDate: '2027-08-11',
    minAge: 12,
    maxAge: 18,
    price: 3900,
    link: `${SITE}/england-camp`,
    hasOwnPage: true,
    bookingOption: 'Summer Camp in UK, Scotland (3 weeks 21/07-11/08)',
    photos: [
      ['8d160b_c11a5e058a88434cb06f34062a4ed615~mv2.png', SITE],
      ['8d160b_ef0976b9fa944797a9b9efa9652de9f5~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_770de0f242a940fbbef0256b9c4ed04c~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_c8fa39fcb4fe403eb536bf54932781e8~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_42d5b4ae76fe4e6794ba27a331eec27b~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_165493ecf83941d1afa45560278ae2f4~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_8aac56aba21a4c8ba30cfbaf695f8534~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_46461848a63045f88aa60d5677fb6656~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_f4843abeb1444bb49fbf9d8e368cb56e~mv2.webp', `${SITE}/england-camp`],
    ],
    shortDescription: L(
      "Learn English with friends from all over the world and native-speaking teachers, and discover a country with a special culture that looks just like a fantasy film!",
      "למדו אנגלית יחד עם חברים מכל העולם ומורים דוברי שפת אם והכירו מדינה עם תרבות מיוחדת שנראית ממש כמו בסרטי פנטזיה!",
      "Учите английский вместе с друзьями со всего мира и преподавателями — носителями языка и откройте страну с особой культурой, которая выглядит прямо как в фэнтези-фильмах!",
    ),
    pageDescription: L(
      "You've surely heard of summer schools in England! But our camps are much more than that.\nAt the summer camps we offer you don't only enjoy challenging activities and facilities — you also learn English with experienced native-speaking teachers and discover amazing, lesser-known places in one of the most beautiful countries in the world.\n\nThe camp runs in English, and Hebrew-speaking counselors from Israel travel with the group.\nIn Britain we have 3 different camps — one in Kent, one near London and one in Scotland! Each has 4-star hotel conditions, activities, 3 meals included and even a pool on site.\nEach group has about 10–15 teens, divided by age.\nEvery 2 teens get a room with an en-suite bathroom.",
      "על מחנות סאמר סקול באנגליה בוודאי כבר שמעתם! אבל המחנות שלנו הם הרבה יותר מזה.\nבמחנות הקיץ שאנו מציעים אפשר לא רק להנות מפעילויות ומתקנים אתגריים, אלא גם ללמוד אנגלית עם מורים מנוסים דוברי אנגלית כשפת אם ולגלות מקומות מדהימים ופחות מוכרים באחת המדינות היפות בעולם.\n\nהמחנה מתנהל בשפה האנגלית, אך מתלווים לקבוצה מדריכים דוברי עברית מהארץ.\nבבריטניה יש לנו 3 מחנות שונים - אחד במחוז קנט, אחד ליד לונדון ואחד בסקוטלנד! בכל אחד מהם יש תנאים של מלון 4 כוכבים, פעילויות, 3 ארוחות כלולות ואף בריכה צמודה.\nבכל קבוצה יש כ10-15 בני נוער שמחולקים לפי גיל.\nכל 2 בני נוער מקבלים חדר עם שירותים צמודים.",
      "О летних школах в Англии вы наверняка уже слышали! Но наши лагеря — это гораздо больше.\nВ наших летних лагерях можно не только наслаждаться захватывающими занятиями и площадками, но и учить английский с опытными преподавателями — носителями языка и открывать удивительные, малоизвестные места в одной из самых красивых стран мира.\n\nЯзык лагеря — английский, с группой едут ивритоязычные вожатые из Израиля.\nВ Великобритании у нас 3 разных лагеря — в графстве Кент, под Лондоном и в Шотландии! В каждом — условия отеля 4 звезды, занятия, трёхразовое питание и даже свой бассейн.\nВ каждой группе около 10–15 подростков, разделённых по возрасту.\nКаждые 2 подростка получают комнату с собственным санузлом.",
    ),
    itinerary: IT.UK_TYPICAL_WEEK,
    itineraryNote: UK_NOTE,
  },
  {
    id: 10,
    slug: 'czech-mountain-camp',
    name: L('Lakes Camp in Czechia', 'מחנה באגמים הצ׳כיים', 'Лагерь на чешских озёрах'),
    location: L('Lake Lipno', 'אגם ליפנו', 'Озеро Липно'),
    country: 'CZ',
    startDate: '2027-07-24',
    endDate: '2027-08-06',
    minAge: 6,
    maxAge: 18,
    price: 1550,
    link: `${SITE}/czech-mountain-camp`,
    hasOwnPage: true,
    bookingOption: 'Summer Camp in Czesh Republic, Lipno (24/07-6/08)',
    photos: [
      ['8d160b_e941d6be620e431cbe5a65c7787b06b6~mv2.png', SITE],
      ['8d160b_fdcd4c3a075146f4a4d9b69c906b36ae~mv2.jpeg', `${SITE}/czech-mountain-camp`],
    ],
    shortDescription: L(
      "English lessons, nature hikes, boat trips and lots of fun and challenge",
      "לימוד אנגלית, טיולים בטבע, שיט בסירה והרבה כיף ואתגר",
      "Английский, прогулки на природе, катание на лодке и много веселья и испытаний",
    ),
    pageDescription: L(
      'A special summer school with English teachers from Oxford, friends from all over the world, and tours and adventures in nature — the real Czechia, away from the tourist traps. The camp is in a holiday village on the Austrian–Czech border with its own beach, a private bowling alley and many walking trails. The groups also produce a professional film.',
      'סאמר סקול מיוחד עם מורים לאנגלית מאוקספורד, חברים מכל העולם, סיורים והרפתקאות בטבע – צ׳כיה האמיתית שמחוץ למלכודות התיירים. המחנה בכפר נופש על גבול אוסטריה-צ׳כיה, עם חוף, מגרש באולינג פרטי ומסלולי הליכה. הקבוצות גם מפיקות סרט מקצועי.',
      'Особая летняя школа с преподавателями из Оксфорда, друзьями со всего мира, экскурсиями и приключениями на природе — настоящая Чехия вдали от туристических ловушек. Лагерь — в курортной деревне на австрийско-чешской границе со своим пляжем, боулингом и пешими тропами. Группы снимают профессиональный фильм.',
    ),
    itinerary: IT.LIPNO,
  },
  {
    id: 11,
    slug: 'serbia-camp',
    name: L('Summer Camp in Serbia', 'מחנה קיץ בסרביה', 'Летний лагерь в Сербии'),
    location: L('Zlatibor', 'זלטיבור', 'Златибор'),
    country: 'RS',
    startDate: '2027-08-03',
    endDate: '2027-08-17',
    minAge: 11,
    maxAge: 18,
    price: 1400,
    link: `${SITE}/serbia-camp`,
    hasOwnPage: true,
    bookingOption: 'Summer Camp in Serbia, Zlatibor (3-17/08)',
    photos: [
      ['8d160b_01e24363df4942d3b202979e4c288c46~mv2.png', SITE],
      ['8d160b_4a4199a66bae4546ba2cd03cb3cdf5b1~mv2.webp', `${SITE}/serbia-camp`],
      ['8d160b_7951f961a8f84b04af9cc667a0687c9c~mv2.webp', `${SITE}/serbia-camp`],
      ['8d160b_ad946db11dd14edd8da27902971a4ed7~mv2.webp', `${SITE}/serbia-camp`],
      ['8d160b_06d66f40aee545f09ae1ae62bd679ab2~mv2.webp', `${SITE}/serbia-camp`],
      ['8d160b_6167fb97921144b79d7137d884063ecf~mv2.webp', `${SITE}/serbia-camp`],
      ['8d160b_1c15119d5a24463092ee367605243e80~mv2.webp', `${SITE}/serbia-camp`],
    ],
    shortDescription: L(
      'Love to celebrate? Crazy about good food? Dream of mountain hikes with friends from around the world, without difficult treks or long drives? Serbia is just for you!',
      'אוהבים לחגוג? מתים על אוכל טוב? חולמים לטייל בהרים עם חברים מכל העולם בלי טרקים מסובכים או נסיעות רחוקות? סרביה היא בדיוק בשבילכם!',
      'Любите праздники? Обожаете вкусную еду? Мечтаете о горах с друзьями со всего мира без сложных походов и долгих переездов? Сербия — для вас!',
    ),
    pageDescription: L(
      "Mountains, nature, adventure, action and great food — we're the first to offer a summer camp at the Zlatibor ski resort, in a ski hotel that becomes a summer-camp site in July and August. The camp runs in English, with counselors from Israel who speak Hebrew and Russian; 2–4 teens per room with en-suite bathroom.",
      'הרים, טבע, הרפתקאות, אקשן ואוכל טוב – אנחנו הראשונים שמציעים מחנה קיץ באתר הסקי זלטיבור, במלון סקי שהופך למחנה קיץ ביולי ובאוגוסט. המחנה מתנהל באנגלית עם מדריכים מהארץ דוברי עברית ורוסית; 2–4 בני נוער בחדר עם שירותים צמודים.',
      'Горы, природа, приключения, экшн и вкусная еда — мы первыми предлагаем лагерь на горнолыжном курорте Златибор, в отеле, который летом становится лагерем. Язык — английский, с вожатыми из Израиля, говорящими на иврите и русском; 2–4 подростка в комнате с удобствами.',
    ),
    itinerary: IT.SERBIA,
  },
  {
    id: 12,
    slug: 'korea-camp',
    name: L('Summer School in South Korea', 'סאמר סקול בדרום קוריאה', 'Летняя школа в Южной Корее'),
    location: L('Seoul', 'סיאול', 'Сеул'),
    country: 'KR',
    startDate: '2027-07-09',
    endDate: '2027-07-23',
    minAge: 12,
    maxAge: 18,
    price: 3500,
    link: `${SITE}/korea-camp`,
    hasOwnPage: true,
    bookingOption: 'Summer Camp in South Korea, Seul (9-23/07)',
    photos: [
      ['8d160b_93e1560a1d8246ff8ccfdf4849df6eb0~mv2.png', SITE],
      ['8d160b_36188cab9b2949168954689a409b7157~mv2.webp', `${SITE}/korea-camp`],
      ['8d160b_c178ec84d14445acbda0052b8441221e~mv2.webp', `${SITE}/korea-camp`],
      ['8d160b_5edabb9eec654705a1b0bd459a3f4ea6~mv2.webp', `${SITE}/korea-camp`],
      ['8d160b_4c8351f589744ed4b35cc6d945385321~mv2.webp', `${SITE}/korea-camp`],
      ['8d160b_45505f60bc8548ce8ab229d6fa587b16~mv2.webp', `${SITE}/korea-camp`],
      ['8d160b_c1e4b4db2496429aba8e243c7f8f77c3~mv2.webp', `${SITE}/korea-camp`],
      ['8d160b_4a474ee11c914bfcab86c6f2f591bfc5~mv2.webp', `${SITE}/korea-camp`],
    ],
    shortDescription: L(
      'Love K-pop and K-drama? Dream of learning Korean, becoming a star and getting to know life in Korea with friends from all over the world? This is your camp!',
      'אוהבים קייפופ ודרמה? חולמים ללמוד קוריאנית, להיות כוכבים ועל הדרך להכיר את החיים בקוריאה יחד עם חברים מכל העולם? זהו המחנה בשבילכם!',
      'Любите K-pop и дорамы? Мечтаете выучить корейский, стать звездой и узнать жизнь в Корее с друзьями со всего мира? Это ваш лагерь!',
    ),
    pageDescription: L(
      "The camp runs in English and Korean and stays at a university hotel in Seoul, Korea's capital. Groups of 10–15 teens by age, two per room with en-suite bathroom; a Hebrew-speaking counselor travels with the group.",
      'המחנה מתנהל באנגלית ובקוריאנית וממוקם במלון אוניברסיטאי בסיאול, בירת קוריאה. קבוצות של 10–15 בני נוער לפי גיל, שניים בחדר עם שירותים צמודים; מדריך דובר עברית יוצא עם הקבוצה.',
      'Лагерь проходит на английском и корейском, проживание — в университетском отеле в Сеуле. Группы по 10–15 подростков по возрасту, по двое в комнате с удобствами; с группой едет вожатый, говорящий на иврите.',
    ),
    itinerary: IT.KOREA,
  },
  {
    id: 13,
    slug: 'germany-camp',
    name: L('Summer School in the Black Forest', 'סאמר סקול ביער השחור', 'Летняя школа в Шварцвальде'),
    location: L('Hotel Freihof, Black Forest', 'מלון פרייהוף, היער השחור', 'Отель Freihof, Шварцвальд'),
    country: 'DE',
    startDate: '2027-07-14',
    endDate: '2027-07-28',
    minAge: 10,
    maxAge: 18,
    price: 2000,
    link: `${SITE}/germany-camp`,
    hasOwnPage: true,
    bookingOption: 'Summer Camp in Germany, Schwarzwald (14-28/07)',
    photos: [
      ['8d160b_d9642d74809b448091d054703f20f2cc~mv2.jpg', SITE],
      ['8d160b_fdcd4c3a075146f4a4d9b69c906b36ae~mv2.jpeg', `${SITE}/germany-camp`],
    ],
    shortDescription: L(
      "Want to learn animation? Or maybe program computer games? Hike in the forest and make friends from all over the world? This is the place for you",
      "רוצים ללמוד אנימציה? או אולי לתכנת משחקי מחשב? לטייל ביער ולהכיר חברים מכל העולם? זהו המקום בשבילכם",
      "Хотите научиться анимации? Или, может, программировать компьютерные игры? Гулять по лесу и находить друзей со всего мира? Это место для вас",
    ),
    pageDescription: L(
      "Learn English, coding or animation with experts who have worked on real games and series, hike magical forests, discover the Brothers Grimm legends and visit Europa-Park. The camp is in a holiday house in a picturesque village in the heart of the Black Forest (Hotel Freihof); two teens per room.",
      'לומדים אנגלית, תכנות או אנימציה עם מומחים שעבדו על משחקים וסדרות, מטיילים ביערות קסומים, מגלים את אגדות האחים גרים ומבקרים בפארק אירופה. המחנה בבית נופש בכפר ציורי בלב היער השחור (מלון פרייהוף); שני בני נוער בחדר.',
      'Английский, программирование или анимация с экспертами, работавшими над играми и сериалами, волшебные леса, легенды братьев Гримм и Европа-Парк. Лагерь — в гостевом доме в живописной деревне в сердце Шварцвальда (отель Freihof); по двое в комнате.',
    ),
    itinerary: IT.GERMANY,
  },
  {
    id: 14,
    slug: 'england-camp-london',
    name: L('Summer School in England (2 weeks)', 'סאמר סקול באנגליה (2 שבועות)', 'Летняя школа в Англии (2 недели)'),
    location: L('London Prior Fields', 'לונדון, פריור פילדס', 'Лондон, Prior Fields'),
    country: 'GB',
    startDate: '2027-07-21',
    endDate: '2027-08-04',
    minAge: 12,
    maxAge: 18,
    price: 2500,
    link: `${SITE}/england-camp`,
    hasOwnPage: true,
    bookingOption: 'Summer Camp in UK, England (2 weeks 21/07-4/08)',
    photos: [
      ['8d160b_0366ab5a71524044bc434840959b176a~mv2.png', SITE],
      ['8d160b_0bb13b07a5e145c497fdd496a930e2d9~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_ef88cee2dbcc4c648b78e812cf6da1f7~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_f788442370894594b2cc0ebedd83af4a~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_5e28b70c5e1744d8bf6414558987ba19~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_fc4dd8deef3a4777b975530c455b9b65~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_6601a697863c4d7d922206e489deb242~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_03f6a1b467be4b4b9666f257f95a2ec5~mv2.webp', `${SITE}/england-camp`],
      ['8d160b_f5f9db0d85904609bd2b9f9f0debdd10~mv2.webp', `${SITE}/england-camp`],
    ],
    shortDescription: ENGLAND_SHORT,
    pageDescription: L(
      "You've surely heard of summer schools in England! But our camps are much more than that.\nAt the summer camps we offer you don't only enjoy challenging activities and facilities — you also learn English with experienced native-speaking teachers and discover amazing, lesser-known places in one of the most beautiful countries in the world.\n\nThe camp runs in English, and Hebrew-speaking counselors from Israel travel with the group.\nIn Britain we have 3 different camps — one in Kent, one near London and one in Scotland! Each has 4-star hotel conditions, activities, 3 meals included and even a pool on site.\nEach group has about 10–15 teens, divided by age.\nEvery 2 teens get a room with an en-suite bathroom.",
      "על מחנות סאמר סקול באנגליה בוודאי כבר שמעתם! אבל המחנות שלנו הם הרבה יותר מזה.\nבמחנות הקיץ שאנו מציעים אפשר לא רק להנות מפעילויות ומתקנים אתגריים, אלא גם ללמוד אנגלית עם מורים מנוסים דוברי אנגלית כשפת אם ולגלות מקומות מדהימים ופחות מוכרים באחת המדינות היפות בעולם.\n\nהמחנה מתנהל בשפה האנגלית, אך מתלווים לקבוצה מדריכים דוברי עברית מהארץ.\nבבריטניה יש לנו 3 מחנות שונים - אחד במחוז קנט, אחד ליד לונדון ואחד בסקוטלנד! בכל אחד מהם יש תנאים של מלון 4 כוכבים, פעילויות, 3 ארוחות כלולות ואף בריכה צמודה.\nבכל קבוצה יש כ10-15 בני נוער שמחולקים לפי גיל.\nכל 2 בני נוער מקבלים חדר עם שירותים צמודים.",
      "О летних школах в Англии вы наверняка уже слышали! Но наши лагеря — это гораздо больше.\nВ наших летних лагерях можно не только наслаждаться захватывающими занятиями и площадками, но и учить английский с опытными преподавателями — носителями языка и открывать удивительные, малоизвестные места в одной из самых красивых стран мира.\n\nЯзык лагеря — английский, с группой едут ивритоязычные вожатые из Израиля.\nВ Великобритании у нас 3 разных лагеря — в графстве Кент, под Лондоном и в Шотландии! В каждом — условия отеля 4 звезды, занятия, трёхразовое питание и даже свой бассейн.\nВ каждой группе около 10–15 подростков, разделённых по возрасту.\nКаждые 2 подростка получают комнату с собственным санузлом.",
    ),
    itinerary: IT.UK_TYPICAL_WEEK,
    itineraryNote: UK_NOTE,
  },
  {
    id: 15,
    slug: 'netherlands-camp',
    name: L('Summer Camp in the Netherlands', 'מחנה קיץ בהולנד', 'Летний лагерь в Нидерландах'),
    location: L('Limburg', 'לימבורג', 'Лимбург'),
    country: 'NL',
    startDate: '2027-07-26',
    endDate: '2027-08-08',
    minAge: 11,
    maxAge: 18,
    price: 2800,
    link: `${SITE}`,
    hasOwnPage: false,
    bookingOption: 'Summer Camp in Netherland, Limburg (27/07-9/08)',
    photos: [['8d160b_35378f8546194390aaa2af84f9f0877b~mv2.webp', SITE]],
    shortDescription: L(
      'Want to learn English or animation with friends from around the world, enjoy roller coasters and be in 3 countries at once at an original, fun camp? The Netherlands is the perfect place!',
      'רוצים ללמוד אנגלית או אנימציה עם חברים מכל העולם, להנות מרכבות הרים וגם להיות ב-3 מדינות בו זמנית במחנה מקורי וכיפי? הולנד היא המקום המושלם!',
      'Хотите учить английский или анимацию с друзьями со всего мира, кататься на американских горках и побывать в трёх странах сразу? Нидерланды — идеальное место!',
    ),
    pageDescription: L(
      'Want to learn English or animation with friends from around the world, enjoy roller coasters and be in 3 countries at once at an original, fun camp? The Netherlands is the perfect place!',
      'רוצים ללמוד אנגלית או אנימציה עם חברים מכל העולם, להנות מרכבות הרים וגם להיות ב-3 מדינות בו זמנית במחנה מקורי וכיפי? הולנד היא המקום המושלם!',
      'Хотите учить английский или анимацию с друзьями со всего мира, кататься на американских горках и побывать в трёх странах сразу? Нидерланды — идеальное место!',
    ),
    itinerary: [],
  },
  {
    id: 16,
    slug: 'prague-camp-august',
    name: L('Summer School in Prague (August)', 'סאמר סקול בפראג (אוגוסט)', 'Летняя школа в Праге (август)'),
    location: L('Prague', 'פראג', 'Прага'),
    country: 'CZ',
    startDate: '2027-08-09',
    endDate: '2027-08-22',
    minAge: 12,
    maxAge: 18,
    price: 1550,
    link: `${SITE}/prague-camp`,
    hasOwnPage: true,
    bookingOption: 'Summer Camp in Czesh Republic, Prague (8-21/07, 9-22/08)',
    photos: [
      ['8d160b_b296ad887721479bb51a456ed6f52a16~mv2.jpeg', SITE],
      ['8d160b_1a03afc2db2848f4be6b7bba276171c2~mv2.jpeg', SITE],
    ],
    shortDescription: PRAGUE_SHORT,
    pageDescription: PRAGUE_PAGE,
    itinerary: IT.PRAGUE,
  },
];

/** Every option of the JotForm "Which camp would you like to join?" field, verbatim. */
export const BOOKING_FORM_CAMP_OPTIONS = [
  'Summer Camp in China, Henan (7-21/07, 9-23/08)',
  'Summer Camp in Czesh Republic, Prague (8-21/07, 9-22/08)',
  'Summer Camp in South Korea, Seul (9-23/07)',
  'Summer Camp in Belarus (10-24/07)',
  'Summer Camp in Moldova (12-26/07)',
  'Summer Camp in Germany, Schwarzwald (14-28/07)',
  'Summer Camp in North Macedonia, Ohrid (19/07-2/08)',
  'Summer Camp in UK, England (2 weeks 21/07-4/08)',
  'Summer Camp in UK, England (2.5 weeks 21/07-8/08)',
  'Summer Camp in UK, Scotland (3 weeks 21/07-11/08)',
  'Summer Camp in Czesh Republic, Lipno (24/07-6/08)',
  'Summer Camp in Netherland, Limburg (27/07-9/08)',
  'Summer Camp in Spain, Barcelona (1-15/08)',
  'Summer Camp in Serbia, Zlatibor (3-17/08)',
  'Summer Camp in Armenia (31/07-12/08)',
  'Summer Camp in Romania, Busteni (12-26/08)',
  'Summer Camp in Japan (12-26/08)',
] as const;

function photoSourcesFor(c: CampData): PhotoSource[] {
  return c.photos.map(([file, page]) => ({
    url: wixImage(file),
    sourcePage: page,
    credit: 'Different Route',
  }));
}

export function campFromData(c: CampData, lang: Lang): Camp {
  const [sy, sm, sd] = c.startDate.split('-').map(Number);
  const [ey, em, ed] = c.endDate.split('-').map(Number);
  return new Camp(
    c.id,
    pick(c.name, lang),
    pick(c.shortDescription, lang),
    new Date(sy, sm - 1, sd),
    new Date(ey, em - 1, ed),
    c.minAge,
    c.maxAge,
    c.country,
    c.price,
    c.link,
    c.photos.map(([file]) => wixImage(file)),
    photoSourcesFor(c),
    'EUR',
    pick(c.location, lang),
    c.provider ?? DEFAULT_PROVIDER,
    c.disability ?? [],
  );
}

export function campPageFromData(c: CampData, lang: Lang): CampPage {
  const camp = campFromData(c, lang);
  return new CampPage(
    c.id,
    camp.name,
    pick(c.pageDescription, lang),
    camp.startDate,
    camp.endDate,
    camp.photos,
    c.itinerary.map((day) => pick(day, lang)),
    camp.photoSources,
    c.link,
    INCLUDED.map((x) => pick(x, lang)),
  );
}

export function campDataById(id: number): CampData | undefined {
  return CAMPS.find((c) => c.id === id);
}
