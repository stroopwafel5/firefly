import { L, LocalizedText } from '../i18n/localized';

/**
 * Day-by-day itineraries, rephrased from each camp's page on www.differentroute.net
 * (read on 9 Oct 2026). One string per day, in order. Nothing here is invented: when
 * the site gives no program for a day, the day is not listed.
 *
 * Known gaps on the site itself (reported to the owner, not patched here):
 *  - /armenia-camp returns 404, so Armenia has no itinerary.
 *  - The Netherlands camp has no page yet.
 *  - /minsk-camp repeats day 13 as day 14, so Belarus lists 13 days.
 *  - The UK pages show "a typical week" (7 days) rather than every day.
 */

const ARRIVAL_BBQ = L(
  'Arrival and check-in — meet your group and counselors, lunch, an icebreaker opening activity and a barbecue evening at camp.',
  'הגעה ורישום למחנה – היכרות עם הקבוצה והמדריכים, ארוחת צהריים, פעילות פתיחה וערב ברביקיו בשטח המחנה.',
  'Приезд и заселение — знакомство с группой и вожатыми, обед, вечер знакомств и барбекю на территории лагеря.',
);
const FLIGHT_HOME = L('Flight home.', 'טיסה חזרה הביתה.', 'Вылет домой.');

export const PRAGUE: LocalizedText[] = [
  ARRIVAL_BBQ,
  L(
    "Morning Zumba workshop, English placement test and first lesson, then a tram ride to Žižkov Hill — one of the city's most beautiful parks, overlooking the Old Town. Board-game evening.",
    'סדנת זומבה בבוקר, מבחן רמה ושיעור אנגלית ראשון, ואחר הצהריים נסיעה ברכבת החשמלית לגבעת ז׳יז׳קוב עם תצפית על העיר העתיקה. ערב משחקי קופסה.',
    'Утренняя зумба, тест на уровень английского и первый урок, затем на трамвае к холму Жижков — одному из красивейших парков с видом на Старый город. Вечер настольных игр.',
  ),
  L(
    'Day trip to Dresden, Germany — the old town and the art gallery, plus a short route among the cliffs, forests and rope bridges of the Bastei in Saxon Switzerland National Park. Disco in the evening.',
    'טיול יום לדרזדן שבגרמניה – העיר העתיקה, גלריית האמנים ומסלול קצר בין צוקים, יערות וגשרי חבלים בבסטיי שבפארק הלאומי. בערב – דיסקו.',
    'Поездка в Дрезден (Германия): Старый город, картинная галерея и короткий маршрут среди скал, лесов и мостов Бастая в нацпарке Саксонская Швейцария. Вечером — дискотека.',
  ),
  L(
    'English and sports in the morning, then a guided tour of old Prague — the Castle District, the famous Charles Bridge and the Astronomical Clock square. Bowling night.',
    'שיעורי אנגלית וספורט, ואחר הצהריים סיור מודרך בפראג העתיקה – רובע הטירה, גשר קארל וכיכר השעון. בערב – באולינג.',
    'Английский и спорт, затем экскурсия по старой Праге: Градчаны, Карлов мост и площадь с Курантами. Вечером — боулинг.',
  ),
  L(
    'Sports day — a traditional boat to Císařská louka island, paddle-boarding (SUP), beach football and volleyball and team-building games. Sunset walk in Riegrovy sady park.',
    'יום ספורט – שיט בסירה מסורתית לאי הקיסרים (צ׳יסרז׳סקה לוקה), סאפים, כדורגל וכדורעף חופים ופעילות גיבוש. בערב – טיול שקיעה בפארק ריגרובי סאדי.',
    'Спортивный день: на традиционной лодке на остров Цисаржска-Лоука, сапы, пляжный футбол и волейбол, командные игры. Прогулка на закате в парке Ригровы сады.',
  ),
  L(
    'English and rehearsals for our theatre show, then the Museum of Illusions to learn the science behind special effects. In the evening — Prague Legends Theatre: each group stages a 5-minute legend.',
    'אנגלית ועבודה על הצגת התיאטרון, ואז מוזיאון האשליות – המדע שמאחורי האשליות והאפקטים. בערב – תיאטרון אגדות פראג: כל קבוצה מציגה אגדה בת 5 דקות.',
    'Английский и репетиции спектакля, затем Музей иллюзий — наука о спецэффектах. Вечером «Театр пражских легенд»: каждая группа ставит 5-минутную легенду.',
  ),
  L(
    'English lessons, then inside Prague Castle to discover its hidden corners — St. Vitus Cathedral, Golden Lane and the royal gardens. Disco and campfire at camp.',
    'שיעורי אנגלית ואחר כך ביקור בתוך טירת פראג – הקתדרלה, סמטת הזהב והגנים המפוארים. בערב – דיסקו ומדורה במחנה.',
    'Уроки английского, затем Пражский град изнутри: собор Святого Вита, Золотая улочка и королевские сады. Вечером — дискотека и костёр.',
  ),
  L(
    'English lesson, an escape-room game in Vyšehrad park and some shopping time. Disco in the camp park.',
    'שיעור אנגלית, משחק חדר בריחה בפארק וישהראד וזמן לקניות. בערב – דיסקו בפארק המחנה.',
    'Урок английского, квест-игра в парке Вышеград и время для покупок. Вечером — дискотека в парке лагеря.',
  ),
  L(
    "English lessons, then the Hunt for the Golem — a team mission through Prague's Jewish Quarter and its history. Movie night.",
    'שיעורי אנגלית, ואז המצוד אחר הגולם – משימה קבוצתית ברובע היהודי ובהיסטוריה שלו. ערב סרט.',
    'Уроки английского, затем «Охота на Голема» — командная миссия по Еврейскому кварталу и его истории. Вечер кино.',
  ),
  L(
    'English lessons and the National Gallery — famous Czech and European artists in a museum that was once an ancient convent. Evening film festival screening the movies each group made.',
    'שיעורי אנגלית וביקור בגלריה הלאומית – אמנים צ׳כיים ואירופאים מפורסמים במוזיאון שהיה פעם מנזר עתיק. בערב – פסטיבל הסרטים שהקבוצות צילמו.',
    'Английский и Национальная галерея — знаменитые чешские и европейские художники в здании бывшего старинного монастыря. Вечером — кинофестиваль фильмов, снятых группами.',
  ),
  L(
    'English lesson, then the Prague museum — everything from dinosaurs to antique musical instruments. Barbecue party.',
    'שיעור אנגלית ומוזיאון פראג – מדינוזאורים ועד כלי נגינה עתיקים. מסיבת ברביקיו.',
    'Урок английского, затем пражский музей — от динозавров до старинных музыкальных инструментов. Вечеринка-барбекю.',
  ),
  L(
    "Rafting day — a trip to Hradec Králové for challenging rafting on one of Czechia's most beautiful rivers. Mafia game in the evening.",
    'יום רפטינג – נסיעה להראדץ קרלובה לרפטינג אתגרי באחד הנהרות היפים בצ׳כיה. בערב – משחק מאפיה.',
    'День рафтинга: поездка в Градец-Кралове и сплав по одной из самых красивых рек Чехии. Вечером — «Мафия».',
  ),
  L(
    'Last English lesson and presentations, then Prague Zoo — bears, lions, elephants and rarer animals. Farewell party and disco with a DJ at a private club.',
    'שיעור אנגלית אחרון ופרזנטציה, ואז גן החיות של פראג – דובים, אריות, פילים וחיות נדירות. מסיבת סיום ודיסקו עם דיג׳יי במועדון פרטי.',
    'Последний урок и презентации, затем Пражский зоопарк — медведи, львы, слоны и редкие животные. Прощальная вечеринка с диджеем в закрытом клубе.',
  ),
  L(
    "Optional day trip to Kutná Hora (extra €100) — a real mine, the chapel decorated with bones and one of Europe's biggest and fastest mountain coasters. 19:00 transfer to the airport and flight home.",
    'טיול יום לקוטנה הורה (בתוספת 100 יורו) – מכרה אמיתי, הכנסייה העשויה מעצמות ומגלשת ההרים מהגדולות והמהירות באירופה. 19:00 העברה לשדה התעופה וטיסה הביתה.',
    'Поездка в Кутна-Гору (доплата 100 €): настоящая шахта, костница и одна из самых больших и быстрых горных трасс в Европе. В 19:00 трансфер в аэропорт и вылет домой.',
  ),
];

export const CHINA: LocalizedText[] = [
  L(
    "Arrival in China and lunch, then meet our Chinese guides and explore central Beijing and Tiananmen Square, one of the world's largest squares. Evening high-speed train to Luoyang and check-in at camp.",
    'נחיתה בסין וארוחת צהריים, מפגש עם המדריכים הסיניים וסיור במרכז בייג׳ינג ובכיכר טיאנאנמן. בערב – רכבת מהירה ללואויאנג ורישום למחנה.',
    'Прилёт в Китай и обед, знакомство с китайскими гидами, прогулка по центру Пекина и площади Тяньаньмэнь. Вечером — скоростной поезд в Лоян и заселение в лагерь.',
  ),
  L(
    'Camp opening ceremony and tour of the grounds, then "Where are we on the map?" — Luoyang, Henan, the Tang and Song dynasties and why they matter. Board-game evening.',
    'טקס פתיחת המחנה והיכרות עם השטח, ואז "איפה אנחנו על המפה?" – לואויאנג, חנאן ושושלות טאנג וסונג. ערב משחקי קופסה.',
    'Открытие лагеря и знакомство с территорией, затем занятие «Где мы на карте?» — Лоян, провинция Хэнань, династии Тан и Сун. Вечер настольных игр.',
  ),
  L(
    "Young Artists — what rice paper is, how it's made, and painting on it as the Chinese did 2,000 years ago. Afternoon at the Longmen Grottoes, carved into the rock thousands of years ago.",
    'אמנים צעירים – מהו נייר אורז, איך מכינים אותו וציור עליו כמו לפני 2,000 שנה. אחר הצהריים – מערות לונגמן שנחצבו בסלע לפני אלפי שנים.',
    '«Юные художники»: что такое рисовая бумага, как её делают, и рисуем на ней, как 2000 лет назад. После обеда — гроты Лунмэнь, высеченные в скале тысячи лет назад.',
  ),
  L(
    'Water-park day at one of the biggest water parks in China, then a barbecue party at camp.',
    'יום פארק מים באחד מפארקי המים הגדולים בסין, ובערב מסיבת ברביקיו במחנה.',
    'День в одном из крупнейших аквапарков Китая, вечером — барбекю в лагере.',
  ),
  L(
    'Fashion workshop on Tang-dynasty clothing and daily life, then an afternoon stroll through old Luoyang dressed in Tang costumes.',
    'סדנת אופנה על שושלת טאנג – איך התלבשו ואיך חיו, ואחר הצהריים טיול ברחבי לואויאנג העתיקה בתחפושות מתקופת טאנג.',
    'Мастер-класс по моде династии Тан и быту того времени, а после обеда — прогулка по старому Лояну в танских костюмах.',
  ),
  L(
    'Rice-paper art, then archery — one of the ancient Chinese "Six Arts". Evening visit to the Hall of Heaven of Empress Wu Zetian, followed by a pizza party and disco.',
    'אמנות על נייר אורז, ואז חץ וקשת – אחת מ"שש האמנויות" הסיניות. בערב – היכל השמיים של הקיסרית וו זטיאן, ואחריו מסיבת פיצה ודיסקו.',
    'Рисование на рисовой бумаге, затем стрельба из лука — одно из древних «Шести искусств». Вечером — Зал Неба императрицы У Цзэтянь, потом пицца-вечеринка и дискотека.',
  ),
  L(
    "Making traditional rice paper and trying ancient painting techniques, then the White Horse Temple — China's first Buddhist temple. Evening lesson on writing Chinese characters.",
    'הכנת נייר אורז מסורתי וטכניקות ציור עתיקות, ואז מקדש הסוס הלבן – המקדש הבודהיסטי הראשון בסין. בערב – לימוד תווים סיניים.',
    'Делаем традиционную рисовую бумагу и пробуем древние техники рисования, затем Храм Белой Лошади — первый буддийский храм Китая. Вечером — учимся писать иероглифы.',
  ),
  L(
    'Day trip to the Shaolin Temple in Dengfeng, birthplace of Zen Buddhism and kung fu — a breathtaking kung fu show and a lesson with a professional coach.',
    'טיול למקדש שאולין בדנגפנג, בירת הקונג פו – מופע קונג פו עוצר נשימה ושיעור עם מאמן מקצועי.',
    'Поездка в монастырь Шаолинь в Дэнфэне — родину дзэн-буддизма и кунг-фу: потрясающее шоу и урок с профессиональным тренером.',
  ),
  L(
    'Paper-flower workshop, then a ceramics workshop at a Tang Sancai centre — the colourful pottery of the Tang dynasty and the Silk Road. Chinese characters, part 2.',
    'סדנת פרחי נייר וסדנת קרמיקה במרכז טאנג סנקאי – הקדרות הצבעונית של שושלת טאנג ודרך המשי. בערב – תווים סיניים, חלק 2.',
    'Мастер-класс по бумажным цветам и керамике «танская трёхцветка» — яркой посуде эпохи Тан и Шёлкового пути. Иероглифы, часть 2.',
  ),
  L(
    "Day trip to the ancient city of Xi'an — the Terracotta Army, its famous museum, a walk along the colourful city walls and traditional food at the old market.",
    'טיול לעיר העתיקה שיאן – צבא הטרקוטה, המוזיאון המפורסם, הליכה לאורך חומות העיר ואוכל סיני מסורתי בשוק הישן.',
    'Поездка в древний Сиань: Терракотовая армия, знаменитый музей, прогулка по городской стене и традиционная еда на старом рынке.',
  ),
  L(
    'Cuju workshop — the real ancient Chinese football from the Tang dynasty, maybe even against local kids. Traditional Chinese games, calligraphy and a disco.',
    'סדנת קוג׳ו – הכדורגל הסיני העתיק משושלת טאנג, אולי אפילו מול ילדים מקומיים. משחקים סיניים מסורתיים, קליגרפיה ודיסקו.',
    'Цуцзюй — настоящий древнекитайский футбол эпохи Тан, возможно, против местных ребят. Традиционные китайские игры, каллиграфия и дискотека.',
  ),
  L(
    "Full day at Kaifeng's Millennium City Park, the \"Chinese Disneyland\" — knights and kung fu shows, the story of Yue Fei, a boat ride and one of the world's biggest light shows.",
    'יום שלם בפארק המילניום בקאיפנג, "דיסנילנד הסינית" – מופעי אבירים וקונג פו, סיפורו של יואה פיי, שיט בסירה ומופע אורות מהגדולים בעולם.',
    'Целый день в парке «Город тысячелетия» в Кайфэне — «китайском Диснейленде»: рыцари и кунг-фу, история Юэ Фэя, катание на лодке и одно из крупнейших световых шоу мира.',
  ),
  L(
    'Archaeology class — what made Luoyang an imperial capital — then the Luoyang Museum, from vases and dragons to life-size royal statues. Closing ceremony and our last disco.',
    'שיעור ארכאולוגיה – מה הפך את לואויאנג לבירה קיסרית, ואז מוזיאון לואויאנג: כדים, דרקונים ופסלי מלכים בגודל טבעי. טקס סיום ודיסקו אחרון.',
    'Урок археологии — почему Лоян стал имперской столицей, затем Лоянский музей: от ваз и драконов до статуй правителей в полный рост. Церемония закрытия и последняя дискотека.',
  ),
  L(
    'Day trip to Yuntai Mountain National Park — rope-bridge trails, peaks, lakes, waterfalls and caves, and a ride on a record-long escalator up the mountain.',
    'טיול יום לפארק הלאומי הר יונטאי – גשרי חבלים, פסגות, אגמים, מפלים ומערות ועלייה במדרגות הנעות הארוכות בעולם.',
    'Поездка в нацпарк гора Юньтай: тропы с подвесными мостами, пики, озёра, водопады и пещеры, подъём на рекордно длинном эскалаторе.',
  ),
  L(
    'Train back to Beijing, lunch at a traditional restaurant, the old hutong lanes and the Houhai area, then transfer to the airport and flight home.',
    'רכבת לבייג׳ינג, ארוחת צהריים במסעדה מסורתית, סיור בחוטונגים וברובע הוהאי, ואז נסיעה לשדה התעופה וטיסה הביתה.',
    'Поезд в Пекин, обед в традиционном ресторане, старинные хутуны и район Хоухай, затем трансфер в аэропорт и вылет домой.',
  ),
];

export const JAPAN: LocalizedText[] = [
  L(
    'Arrival and check-in, lunch, an introduction to Japan with a language test, and team-building with the counselors.',
    'הגעה ורישום, ארוחת צהריים, הרצאה על יפן ומבחן שפה, ופעילות גיבוש עם המדריכים.',
    'Приезд и заселение, обед, рассказ о Японии и языковой тест, знакомство с вожатыми.',
  ),
  L(
    'Getting to know Japan — Japanese placement test and opening lesson, traditional Japanese games and an evening walk in modern Sapporo.',
    'היכרות עם יפן – מבחן רמה ושיעור פתיחה ביפנית, משחקים יפניים מסורתיים וטיול ערב בסאפורו המודרנית.',
    'Знакомство с Японией: тест на уровень японского и первый урок, традиционные японские игры и вечерняя прогулка по современному Саппоро.',
  ),
  L(
    'Calligraphy and writing — Japanese lessons, a Japanese calligraphy workshop and team games.',
    'קליגרפיה וכתיבה – שיעורי יפנית, סדנת קליגרפיה יפנית ומשחקי גיבוש.',
    'Каллиграфия и письмо: уроки японского, мастер-класс японской каллиграфии и командные игры.',
  ),
  L(
    'Chocolate and traditional sweets — Japanese lessons and a visit to Shiroi Koibito Park, a sweets-kingdom theme park where you learn how Japanese sweets are made. Movie night.',
    'שוקולד וממתקים מסורתיים – שיעורי יפנית וביקור בפארק השוקולד שירוי קויביטו, ממלכת ממתקים שבה לומדים איך מכינים ממתקים יפניים. ערב סרט.',
    'Шоколад и традиционные сладости: уроки японского и парк Shiroi Koibito — королевство сладостей, где показывают, как делают японские конфеты. Вечер кино.',
  ),
  L(
    'Tea ceremony and culture — Japanese lessons and a traditional Japanese tea ceremony workshop.',
    'טקס תה ותרבות – שיעורי יפנית וסדנת טקס תה יפני מסורתי.',
    'Чайная церемония и культура: уроки японского и мастер-класс традиционной чайной церемонии.',
  ),
  L(
    "Journey to the past — a full day at an open-air museum of old Japan, including a children's theatre show in Japanese that teaches lots of new words.",
    'מסע אל העבר – יום שלם במוזיאון הפתוח של יפן העתיקה, כולל הצגת תיאטרון לילדים ביפנית שמלמדת הרבה מילים חדשות.',
    'Путешествие в прошлое: целый день в музее под открытым небом о старой Японии и детский спектакль на японском — много новых слов.',
  ),
  L(
    'Ikebana — Japanese lessons and a flower-arranging workshop. Mafia game in the evening.',
    'איקבנה – שיעורי יפנית וסדנת סידור פרחים יפני. בערב – משחק מאפיה.',
    'Икебана: уроки японского и мастер-класс по составлению букетов. Вечером — «Мафия».',
  ),
  L(
    'Lakes and ninjas — a trip to Lake Kuttara and a ninja village: a real ninja show, photos with warriors and trying ninja techniques yourself.',
    'אגמים ונינג׳ות – נסיעה לאגם קוטארה וביקור בכפר הנינג׳ות: מופע נינג׳ות אמיתי, תמונות עם לוחמים ותרגול טכניקות נינג׳ה.',
    'Озёра и ниндзя: поездка к озеру Куттара и в деревню ниндзя — настоящее шоу, фото с воинами и тренировка техник ниндзя.',
  ),
  L(
    'Hot springs and mystery — a hot-spring town and the "Hell Valley" trail, a geological wonder of red-coloured hills and black earth that feels like another planet.',
    'מעיינות חמים ומסתורין – עיר המעיינות החמים ומסלול "עמק הגיהנום", תופעה גאולוגית של הרים אדומים ואדמה שחורה, ממש כמו בכוכב אחר.',
    'Горячие источники и тайны: город горячих источников и тропа «Адская долина» — красные холмы и чёрная земля, будто на другой планете.',
  ),
  L(
    'Legends and bears — a walk through traditional Japanese legends with professional guides, a visit to a bear farm and the ride back to Sapporo.',
    'אגדות ודובים – מסלול אגדות יפן עם מדריכים מקצועיים, ביקור בחוות דובים וחזרה לסאפורו.',
    'Легенды и медведи: прогулка по японским легендам с профессиональными гидами, медвежья ферма и возвращение в Саппоро.',
  ),
  L(
    'Anime day — Japanese lessons and an anime workshop: drawing techniques and creating a short anime scene as a group. "Find the counselor" game in the evening.',
    'יום אנימה – שיעורי יפנית וסדנת אנימה: טכניקות ציור ויצירת סצנת אנימה קצרה כקבוצה. בערב – "חפש את המדריך".',
    'День аниме: уроки японского и мастер-класс по аниме — техники рисования и короткая сцена, созданная группой. Вечером — игра «Найди вожатого».',
  ),
  L(
    'A day by the sea — Japanese lessons, then the port town of Otaru for a boat ride and a traditional glass workshop.',
    'יום על הים – שיעורי יפנית וסיור בעיר הנמל אוטארו: שיט בסירה וסדנת זכוכית מסורתית.',
    'День у моря: уроки японского, затем портовый город Отару — прогулка на лодке и традиционная мастерская стекла.',
  ),
  L(
    'The big test — Japanese level exam and certificates, translating a whole anime episode from Japanese, and a farewell activity.',
    'המבחן הגדול – מבחן רמה ביפנית וקבלת תעודות, תרגום פרק אנימה שלם מיפנית ופעילות פרידה.',
    'Большой экзамен: тест по японскому и сертификаты, перевод целой серии аниме с японского и прощальный вечер.',
  ),
  FLIGHT_HOME,
];

export const KOREA: LocalizedText[] = [
  L(
    'Arrival and check-in, lunch, an introduction to South Korea with a language test, and team-building with the counselors.',
    'הגעה ורישום, ארוחת צהריים, הרצאה על דרום קוריאה ומבחן שפה, ופעילות גיבוש עם המדריכים.',
    'Приезд и заселение, обед, рассказ о Южной Корее и языковой тест, знакомство с вожатыми.',
  ),
  L(
    'Korean lessons, then Myeongdong — shops, cafés and places dedicated to K-pop culture. Team games.',
    'שיעורי קוריאנית ורובע מיונגדונג – חנויות, בתי קפה ומקומות שכולם מוקדשים לתרבות הקייפופ. משחקי גיבוש.',
    'Уроки корейского, затем район Мёндон — магазины, кафе и всё, что связано с K-pop. Командные игры.',
  ),
  L(
    'Korean lessons and the National Museum of Korea to discover Korean history. Team games.',
    'שיעורי קוריאנית וביקור במוזיאון הלאומי – היכרות עם ההיסטוריה הקוריאנית. משחקי גיבוש.',
    'Уроки корейского и Национальный музей Кореи — знакомство с историей страны. Командные игры.',
  ),
  L(
    'Korean lessons and a tour of Insadong — traditional shops and tea houses, street performers and the best place to learn about old Korean life. Mafia game.',
    'שיעורי קוריאנית וסיור ברובע אינסדונג – חנויות ובתי תה מסורתיים, אמני רחוב והמקום הטוב ביותר להכיר את קוריאה של פעם. משחק מאפיה.',
    'Уроки корейского и квартал Инсадон — традиционные лавки и чайные, уличные артисты и лучшее место, чтобы узнать о жизни старой Кореи. «Мафия».',
  ),
  L(
    'Korean lessons and HiKR Ground — five floors of exhibits about K-pop and K-drama culture.',
    'שיעורי קוריאנית וביקור בהייקר גראונד – 5 קומות של מיצגים על הקייפופ ועל תרבות הקיי-דרמה.',
    'Уроки корейского и HiKR Ground — пять этажей экспозиций о K-pop и дорамах.',
  ),
  L(
    "Korean lessons and Seodaemun Prison, built under the Japanese occupation, to learn about Korea's history around World War II.",
    'שיעורי קוריאנית וביקור בכלא סודמון מתקופת הכיבוש היפני – ההיסטוריה הקוריאנית בתקופת מלחמת העולם השנייה.',
    'Уроки корейского и тюрьма Содэмун времён японской оккупации — история Кореи в годы Второй мировой войны.',
  ),
  L(
    'A full day at Lotte World, one of the biggest amusement parks of its kind in the world. Barbecue evening.',
    'יום שלם בפארק השעשועים לוטה וורלד, מהגדולים מסוגו בעולם. בערב – ברביקיו.',
    'Целый день в Lotte World — одном из крупнейших парков развлечений в мире. Вечером — барбекю.',
  ),
  L(
    "Korean lessons and a taekwondo workshop — Korea's traditional martial art.",
    'שיעורי קוריאנית וסדנת טאקוונדו – אמנות הלחימה הקוריאנית המסורתית.',
    'Уроки корейского и мастер-класс тхэквондо — традиционного корейского боевого искусства.',
  ),
  L(
    'Korean lessons and a traditional Korean crafts workshop.',
    'שיעורי קוריאנית וסדנת יצירה קוריאנית מסורתית.',
    'Уроки корейского и мастер-класс по традиционным корейским ремёслам.',
  ),
  L(
    'Korean lessons and shopping in Dongdaemun and around the DDP — some of the biggest and most unusual shopping centres in the world.',
    'שיעורי קוריאנית ושופינג ברובע דונגדמון וב-DDP – ממרכזי הקניות הגדולים והמיוחדים בעולם.',
    'Уроки корейского и шопинг в Тондэмуне и вокруг DDP — одни из крупнейших и необычных торговых центров мира.',
  ),
  L(
    "Korean lessons and Gyeongbokgung — the largest of Seoul's five royal palaces and a symbol of the Joseon dynasty.",
    'שיעורי קוריאנית וארמון גיונגבוקגונג – הגדול מבין חמשת הארמונות המלכותיים בסיאול וסמל שושלת צ׳וסון.',
    'Уроки корейского и Кёнбоккун — крупнейший из пяти королевских дворцов Сеула, символ династии Чосон.',
  ),
  L(
    'Korean lessons and a K-pop workshop — learn to dance like real idols and take on dance challenges.',
    'שיעורי קוריאנית וסדנת קייפופ – רוקדים כמו איידולס אמיתיים ומשתתפים באתגרי ריקוד.',
    'Уроки корейского и мастер-класс K-pop — танцуем как настоящие айдолы и участвуем в челленджах.',
  ),
  L(
    'Korean level test and certificates, then Gangnam and the COEX mall — the Starfield Library, the shark aquarium and Bongeunsa Temple. Farewell activity.',
    'מבחן רמה בקוריאנית וקבלת תעודות, ואז רובע גאנגנם וקניון COEX – הספרייה, אקווריום הכרישים ומקדש בונגאונסה. פעילות פרידה.',
    'Тест по корейскому и сертификаты, затем Каннам и ТЦ COEX — библиотека Starfield, аквариум с акулами и храм Понынса. Прощальный вечер.',
  ),
  FLIGHT_HOME,
];

export const GERMANY: LocalizedText[] = [
  ARRIVAL_BBQ,
  L(
    "English, coding or animation classes, then the Fairy-Tale Trail — the Black Forest's most magical path, lined with wooden sculptures from the stories we grew up on. Board games.",
    'שיעורי אנגלית / תכנות / אנימציה, ואז שביל האגדות – השביל הקסום ביותר ביער השחור, עם פסלי עץ מהאגדות שגדלנו עליהן. ערב משחקי קופסה.',
    'Занятия по английскому, программированию или анимации, затем «Тропа сказок» — самая волшебная тропа Шварцвальда с деревянными скульптурами сказочных героев. Настольные игры.',
  ),
  L(
    "Classes, then a mini-golf tournament between the groups on the area's biggest course. Bowling night.",
    'שיעורים, ואז תחרות מיני גולף בין הקבוצות במסלול הגדול באזור. בערב – באולינג.',
    'Занятия, затем турнир по мини-гольфу между группами на самом большом поле в округе. Вечером — боулинг.',
  ),
  L(
    'A full day at Europa-Park, a one-of-a-kind theme park with one of the fastest roller coasters in the world.',
    'יום שלם בפארק אירופה – פארק שעשועים מיוחד עם אחת מרכבות ההרים המהירות בעולם.',
    'Целый день в Европа-Парке — уникальном парке развлечений с одними из самых быстрых американских горок в мире.',
  ),
  L(
    'Classes, then the adventure trail in Hausach — a slightly challenging path full of riddles to solve as a team. Mafia game.',
    'שיעורים, ואז שביל ההרפתקאות בהאוזאך – מסלול מאתגר מעט עם חידות לפתור כקבוצה. משחק מאפיה.',
    'Занятия, затем тропа приключений в Хаузахе — немного сложный маршрут с загадками для всей команды. «Мафия».',
  ),
  L(
    'Classes and a traditional German cooking workshop. Bowling night.',
    'שיעורים וסדנת בישול גרמני מסורתי. ערב באולינג.',
    'Занятия и мастер-класс традиционной немецкой кухни. Вечером — боулинг.',
  ),
  L(
    'Day trip to Strasbourg — cross the border into France, explore the old town nicknamed "Little Venice", taste local food and discover what makes Alsace so special.',
    'סיור בשטרסבורג – חוצים את הגבול לצרפת, מטיילים בעיר העתיקה המכונה "ונציה הקטנה", טועמים מהאוכל המקומי ומגלים את אלזס.',
    'Поездка в Страсбург: пересекаем границу Франции, гуляем по старому городу — «Маленькой Венеции», пробуем местную кухню и открываем Эльзас.',
  ),
  L(
    'Classes, then the climb to the Katzenstein lookout for a view over the Black Forest. Theatre evening — the groups start producing their play.',
    'שיעורים, ואז טיפוס למצפה אבן החתול (קצנשטיין) ותצפית על היער השחור. ערב תיאטרון – מתחילים להפיק את ההצגה.',
    'Занятия, затем подъём на смотровую площадку Катценштайн с видом на Шварцвальд. Театральный вечер — группы начинают ставить спектакль.',
  ),
  L(
    'Classes, a tour of the village flour mill and local life, and more work on the play.',
    'שיעורים, סיור בתחנת הקמח של הכפר והיכרות עם החיים המקומיים, וממשיכים להכין את ההצגה.',
    'Занятия, экскурсия на деревенскую мельницу и знакомство с местной жизнью, работа над спектаклем.',
  ),
  L(
    'The Black Forest Open-Air Museum to see how people once lived here, lunch at a traditional restaurant and the Triberg Falls, among the highest in Germany. Photography activity.',
    'המוזיאון הפתוח של היער השחור – איך חיו כאן פעם, ארוחת צהריים במסעדה מסורתית ומפלי טריברג, מהגבוהים בגרמניה. פעילות צילום.',
    'Музей под открытым небом Шварцвальда — как здесь жили раньше, обед в традиционном ресторане и водопады Трибер, одни из самых высоких в Германии. Фотозанятие.',
  ),
  L(
    "English lesson, then a bear park — learn how bears are rescued, feed them carrots (did you know they're vegetarian?) and meet foxes and wildcats. Play night: the groups perform their fairy tale.",
    'שיעור אנגלית ופארק הדובים – איך מצילים דובים, מאכילים אותם בגזר (הידעתם שהם צמחוניים?) ופוגשים שועלים וחתולי בר. ערב ההצגה – כל קבוצה מציגה את האגדה שהכינה.',
    'Урок английского, затем медвежий парк: как спасают медведей, кормим их морковкой (знали, что они вегетарианцы?) и знакомимся с лисами и дикими кошками. Вечер спектаклей.',
  ),
  L(
    'A rope-bridge park 100 metres above the ground, then Freiburg — lunch and a walk through the old town, famous for its little canals and cathedral.',
    'פארק גשרי החבלים – 100 מטר מעל הקרקע, ואז פרייבורג: ארוחת צהריים וסיור בעיר העתיקה הידועה בתעלות ובקתדרלה.',
    'Парк подвесных мостов на высоте 100 метров, затем Фрайбург — обед и прогулка по старому городу с ручейками-каналами и собором.',
  ),
  L(
    'Presentations — everyone shows the game or animation they created — then the camp journal of our memories. Farewell party and disco.',
    'פרזנטציה – כל אחד מציג את המשחק או האנימציה שיצר, ואז יומן המחנה עם כל החוויות. מסיבת סיום ודיסקו.',
    'Презентации — каждый показывает свою игру или анимацию, затем альбом-дневник лагеря. Прощальная вечеринка и дискотека.',
  ),
  L(
    'Breakfast, transfer to the airport and flight home.',
    'ארוחת בוקר, העברה לשדה התעופה וטיסה הביתה.',
    'Завтрак, трансфер в аэропорт и вылет домой.',
  ),
];

export const LIPNO: LocalizedText[] = [
  ARRIVAL_BBQ,
  L(
    "A walk through Přední Výtoň, one of Czechia's oldest and prettiest villages on the shore of Lake Lipno, English placement test, then swimming and water activities in the lake. Board games.",
    'סיור בכפר פרדני ויטון, מהיפים והעתיקים בצ׳כיה על גדות אגם ליפנו, מבחן רמה באנגלית, ופעילות מים ושחייה באגם. ערב משחקי קופסה.',
    'Прогулка по Предни-Витони — одной из самых старых и красивых деревень Чехии на берегу Липно, тест по английскому, затем купание и игры на озере. Настольные игры.',
  ),
  L(
    'Day trip to Český Krumlov, one of Europe\'s most beautiful walled old towns, and Hluboká nad Vltavou castle, home to Czech nobles until not long ago. "Find the counselor" game.',
    'טיול יום לצ׳סקי קרומלוב, מהערים העתיקות היפות באירופה, וטירת הלובוקה נאד ולטאבו שבה חיו אצילים צ׳כיים. משחק "חפש את המדריך".',
    'Поездка в Чески-Крумлов — один из красивейших старых городов Европы — и в замок Глубока-над-Влтавой, где ещё недавно жила чешская знать. Игра «Найди вожатого».',
  ),
  L(
    'A forest hike to the mysterious Vítkův Hrádek castle overlooking Lake Lipno, then English and sports. Bowling night.',
    'מסלול רגלי ביער אל טירת ויטקוב הרדק המסתורית עם נוף לאגם ליפנו, ואחר כך אנגלית וספורט. ערב באולינג.',
    'Поход через лес к таинственному замку Витков-Градек с видом на Липно, затем английский и спорт. Вечером — боулинг.',
  ),
  L(
    'Rafting adventure on the Vltava river, an English lesson on the beach, campfire and disco.',
    'רפטינג אתגרי על נהר הוולטאבה, שיעור אנגלית על החוף, מדורה ודיסקו.',
    'Рафтинг по Влтаве, урок английского на пляже, костёр и дискотека.',
  ),
  L(
    'English lessons, then a fashion activity with a professional designer — each group creates its own costume and the story behind it. Campfire and disco.',
    'שיעורי אנגלית ופעילות אופנה עם מעצב מקצועי – כל קבוצה יוצרת תחפושת וסיפור מאחוריה. מדורה ומסיבת דיסקו.',
    'Уроки английского и мастер-класс с профессиональным дизайнером: каждая группа создаёт костюм и его историю. Костёр и дискотека.',
  ),
  L(
    'Bike tour in small groups around Lake Lipno, English lesson and a legends activity. (Optional day trip to Salzburg at extra cost.)',
    'סיור אופניים בקבוצות קטנות סביב אגם ליפנו, שיעור אנגלית ופעילות אגדות. (למעוניינים – טיול יום לזלצבורג בתשלום נוסף.)',
    'Велопрогулка небольшими группами вокруг Липно, урок английского и вечер легенд. (По желанию — поездка в Зальцбург за доплату.)',
  ),
  L(
    'English lesson, then Poseidon Day — Greek mythology and team contests on the lake with boats, kayaks and SUPs. Disco in the camp park.',
    'שיעור אנגלית ויום פוסידון – מיתולוגיה יוונית ותחרויות בין הקבוצות על האגם עם סירות, קיאקים וסאפים. דיסקו בפארק המחנה.',
    'Урок английского и День Посейдона — греческие мифы и соревнования на озере на лодках, каяках и сапах. Дискотека в парке лагеря.',
  ),
  L(
    "Day trip to Linz, Austria — a treasure hunt and free time in one of Austria's biggest and loveliest cities. Movie night.",
    'טיול יום ללינץ שבאוסטריה – חיפוש מטמון וזמן חופשי באחת הערים היפות באוסטריה. ערב סרט.',
    'Поездка в Линц (Австрия): поиск сокровищ и свободное время в одном из самых больших и красивых городов Австрии. Вечер кино.',
  ),
  L(
    'English lessons and final filming for our film festival, then the festival itself, screening the movies the groups made.',
    'שיעורי אנגלית והכנות לצילום לפסטיבל הסרטים, ובערב – הפסטיבל עם הסרטים שהקבוצות צילמו.',
    'Уроки английского и подготовка к кинофестивалю, вечером — показ фильмов, снятых группами.',
  ),
  L(
    'A boat trip to the national park at Frymburk and an easy loop trail with stunning lake views. Circus show in the evening.',
    'שיט בספינה לפארק הלאומי בפרימבורק ומסלול מעגלי קל עם נופים מרהיבים על האגם. בערב – מופע קרקס.',
    'На корабле к нацпарку у Фримбурка и лёгкий кольцевой маршрут с видами на озеро. Вечером — цирковое шоу.',
  ),
  L(
    'English lesson, beach volleyball and chill-out time at the lake. Campfire.',
    'שיעור אנגלית, כדורעף חופים וזמן צ׳ילאאוט באגם. מדורה.',
    'Урок английского, пляжный волейбол и отдых у озера. Костёр.',
  ),
  L(
    "English lesson, then a last, challenging trail through one of Czechia's most beautiful forests. Mafia game.",
    'שיעור אנגלית ומסלול אחרון ומאתגר באחד היערות היפים בצ׳כיה. משחק מאפיה.',
    'Урок английского и последний непростой маршрут через один из красивейших лесов Чехии. «Мафия».',
  ),
  L(
    'Last English lesson and presentations, ball games on the beach, and an evening cruise on a private boat with the farewell party.',
    'שיעור אנגלית אחרון ופרזנטציה, משחקי כדור על החוף, ובערב שיט בספינה פרטית ומסיבת סיום.',
    'Последний урок и презентации, игры с мячом на пляже, вечерняя прогулка на частном корабле и прощальная вечеринка.',
  ),
];

export const SERBIA: LocalizedText[] = [
  L(
    'Welcome to Zlatibor — arrival, opening activity, a walking tour of Zlatibor, a big team game and a welcome party.',
    'ברוכים הבאים לזלטיבור – הגעה, פעילות פתיחה, סיור רגלי בזלטיבור, משחק קבוצתי גדול ומסיבת קבלת פנים.',
    'Добро пожаловать в Златибор: приезд, открытие смены, пешая экскурсия по Златибору, большая командная игра и приветственная вечеринка.',
  ),
  L(
    'Gold Gondola and Tornik — ride the gondola up to Tornik peak, the mountain bobsled, tubing, and an optional zip line.',
    'גונדולת הזהב וטורניק – עלייה ברכבל להר טורניק, מגלשת הרים, אבובים ואומגה (אופציונלי).',
    'Золотая гондола и Торник: подъём на гору Торник, горный бобслей, тюбинг и по желанию зиплайн.',
  ),
  L(
    'Caves, mountains and mystery — Stopića Cave, the Sirogojno ethno village where time stood still, Gostilje waterfall and a mountain trail.',
    'מערות, הרים ומסתורין – מערת סטופיצ׳ה, הכפר האתני סירוגוינו שבו הזמן עצר מלכת, מפל גוסטיליה וטיול בשביל ההרים.',
    'Пещеры, горы и тайны: пещера Стопича, этнодеревня Сирогойно, где время остановилось, водопад Гостилье и горная тропа.',
  ),
  L(
    'Traditional Serbian day — a baking workshop (gibanica), a kolo folk-dance class with a certified instructor, and a Mafia game.',
    'יום סרבי מסורתי – סדנת אפייה (גיבניצה), סדנת ריקוד הקולו הסרבי המסורתי עם מדריך מוסמך ומשחק מאפיה.',
    'Традиционный сербский день: мастер-класс выпечки (гибаница), народный танец коло с инструктором и «Мафия».',
  ),
  L(
    'Guča festival — a day at the famous Serbian trumpet festival: brass bands, Serbian dances, street shows, a folk-crafts fair and traditional food.',
    'פסטיבל גוצ׳ה – יום בפסטיבל החצוצרות הסרבי: תזמורות כלי נשיפה, ריקודים, מופעי רחוב, יריד מלאכות ומטבח סרבי מסורתי.',
    'Фестиваль в Гуче: день на знаменитом сербском фестивале трубачей — духовые оркестры, танцы, уличные шоу, ярмарка ремёсел и традиционная кухня.',
  ),
  L(
    'Chill day — pool time, a sports day of team games (dodgeball, capture the flag, football, basketball) and a movie night.',
    'יום צ׳יל – בריכה, יום ספורט עם תחרויות בין הקבוצות (מחניים, תפוס את הדגל, כדורגל, כדורסל) וערב סרט.',
    'День отдыха: бассейн, спортивный день с командными играми (вышибалы, захват флага, футбол, баскетбол) и вечер кино.',
  ),
  L(
    'Mokra Gora — the famous Šargan Eight railway through hidden mountain scenery, then Drvengrad, the film village of director Emir Kusturica. Disco.',
    'מוקרה גורה – רכבת "שמונה של שרגן" המפורסמת במסלול הרים נסתר, ואז דרוונגרד, כפר הסרטים של הבמאי אמיר קוסטוריצה. דיסקו.',
    'Мокра-Гора: знаменитая железная дорога «Шарганская восьмёрка» и Древнград — деревня режиссёра Эмира Кустурицы. Дискотека.',
  ),
  L(
    "Adventure day — the region's biggest adventure park: ropes course, zip line, climbing wall and laser tag. Mission game on campus.",
    'יום הרפתקאות – פארק החבלים הגדול באזור: מסלול חבלים, אומגה, קיר טיפוס ולייזר טאג. משחק משימות בקמפוס.',
    'День приключений: самый большой верёвочный парк в округе — верёвочная трасса, зиплайн, скалодром и лазертаг. Квест на территории лагеря.',
  ),
  L(
    'Rafting near Bajina Bašta, kayaking on a calm stretch of the Drina, water games and a beach picnic. Hollywood-style drama workshop in the evening.',
    'רפטינג באזור באינה בשטה, קיאקים בקטע שקט של נהר הדרינה, משחקי מים ופיקניק על החוף. בערב – סדנת דרמה בסגנון הוליווד.',
    'Рафтинг у Баина-Башты, каяки на спокойном участке Дрины, игры на воде и пикник на берегу. Вечером — театральный мастер-класс в стиле Голливуда.',
  ),
  L(
    'Farm experiences — farm life, picking vegetables in the garden, making homemade cheese and kajmak, tasting local produce and a traditional craft workshop. Campfire.',
    'חוויות בחווה – היכרות עם חיי החווה, קטיף ירקות, הכנת גבינה וקאימק ביתיים, טעימת תוצרת מקומית וסדנת מלאכת יד. ערב מדורה.',
    'Ферма: жизнь на ферме, сбор овощей, домашний сыр и каймак, дегустация местных продуктов и мастер-класс народных ремёсел. Костёр.',
  ),
  L(
    'Uvac Canyon — a boat ride through the canyon, watching griffon vultures, a cave visit and a hike to a panoramic viewpoint.',
    'קניון אובאץ – שיט בסירה בקניון, צפייה בנשרים, ביקור במערה וטיול רגלי לתצפית פנורמית.',
    'Каньон Увац: прогулка на лодке, белоголовые сипы, пещера и поход к панорамной смотровой площадке.',
  ),
  L(
    'Horse riding, a nature walk in Zlatibor and an evening program.',
    'רכיבה על סוסים, הליכה בטבע של זלטיבור ותוכנית ערב.',
    'Верховая езда, прогулка по природе Златибора и вечерняя программа.',
  ),
  L(
    'Folklore festival — the International Children\'s Folklore Festival "Licidersko srce": groups from many countries, national dances, traditional costumes and music. Disco.',
    'פסטיבל הפולקלור – פסטיבל הפולקלור הבינלאומי לילדים "ליצידרסקו סרצה": להקות ממדינות שונות, ריקודים, תלבושות ומוזיקה. דיסקו.',
    'Фестиваль фольклора: Международный детский фестиваль «Лицидерско срце» — коллективы из разных стран, народные танцы, костюмы и музыка. Дискотека.',
  ),
  L(
    "Second day of the folklore festival, a wrap-up activity and the camp's closing party.",
    'היום השני של פסטיבל הפולקלור, פעילות סיכום ומסיבת סיום המחנה.',
    'Второй день фестиваля, подведение итогов и закрытие лагеря.',
  ),
  FLIGHT_HOME,
];

export const MACEDONIA: LocalizedText[] = [
  L(
    'Arrival and check-in, lunch, an icebreaker opening activity and a welcome party at sunset.',
    'הגעה ורישום, ארוחת צהריים, פעילות פתיחה ומסיבת קבלת פנים בשקיעה.',
    'Приезд и заселение, обед, вечер знакомств и приветственная вечеринка на закате.',
  ),
  L(
    'Kayaking on Lake Ohrid, then "Wacky Races" — team challenges on the water. Campfire.',
    'קיאקים באגם אוחריד, ואז "Wacky Races" – משחקי מירוץ אתגריים על המים בין הקבוצות. מדורה.',
    'Каяки на Охридском озере, затем «Сумасшедшие гонки» — командные соревнования на воде. Костёр.',
  ),
  L(
    'Ohrid — a treasure hunt through the old town, its churches, the promenade and shopping street, ending with an amazing view of the lake from Kaneo beach.',
    'ביקור באוחריד – חפש את המטמון ברובע העתיק, כנסיות, טיילת ורחוב הקניות, ובסוף תצפית מדהימה על האגם מחוף קניאו.',
    'Охрид: поиск сокровищ по старому городу, церкви, набережная и торговая улица, а в конце — потрясающий вид на озеро с пляжа Канео.',
  ),
  L(
    'Hike in Galičica National Park, with views over Lake Ohrid and as far as Greece and Albania. Barbecue party at camp.',
    'טיול בפארק הלאומי גאליצ׳יצה עם תצפית על אגם אוחריד ועד יוון ואלבניה. מסיבת ברביקיו במחנה.',
    'Поход в национальном парке Галичица с видом на Охридское озеро, Грецию и Албанию. Барбекю в лагере.',
  ),
  L(
    "The Bay of Bones open-air museum, the Monastery of St. Naum — North Macedonia's national symbol — and a glass-bottom boat ride on the river springs. Disco and campfire.",
    'מפרץ הגולגלות – מוזיאון פתוח מימי קדם, מנזר נאום הקדוש – הסמל הלאומי של מקדוניה, ושיט בסירת זכוכית על מעיינות הנהר. דיסקו ומדורה.',
    'Музей под открытым небом «Залив костей», монастырь Святого Наума — национальный символ страны, и прогулка на лодке со стеклянным дном по истокам реки. Дискотека и костёр.',
  ),
  L(
    'Ceramics workshop — shape and paint a traditional clay pot — then beach volleyball and games on the lakeshore. Talent show with a great prize.',
    'סדנת קרמיקה – מפסלים וצובעים כד מסורתי, ואז כדורעף חופים ומשחקים על גדות האגם. מופע כישרונות עם פרס שווה.',
    'Мастер-класс по керамике — лепим и расписываем традиционный кувшин, потом пляжный волейбол на берегу. Шоу талантов с призом.',
  ),
  L(
    'Water day — a Greek-Macedonian water olympiad with SUPs, kayaks, swimming and boat races between the groups. Campfire.',
    'יום מים – אולימפיאדת מים בסגנון יווני-מקדוני: סאפים, קיאקים ותחרויות שחייה ושייט בין הקבוצות. מדורה.',
    'День воды: греко-македонская водная олимпиада — сапы, каяки, заплывы и гонки на лодках. Костёр.',
  ),
  L(
    'Struga — Albanian culture, the differences between the north and south of the lake, an escape-room mission in the old town and a walk along the Black Drin. Free time on the beach and a Mafia game.',
    'סיור בסטרוגה – תרבות אלבנית, ההבדלים בין צפון האגם לדרומו, משימת אסקייפ רום בעיר העתיקה וטיול לאורך הנהר. זמן חופשי בחוף ומשחק מאפיה.',
    'Струга: албанская культура, отличия севера и юга озера, квест-миссия в старом городе и прогулка вдоль Чёрного Дрина. Свободное время на пляже и «Мафия».',
  ),
  L(
    'Rock climbing and rappelling in the mountains above Ohrid — or a beautiful hike with the counselors for anyone who prefers to keep their feet on the ground.',
    'טיפוס צוקים וסנפלינג בהרי אוחריד – ומי שמעדיף, יוצא לסיור הליכה יפהפה עם המדריכים.',
    'Скалолазание и спуск на верёвке в горах над Охридом — а для тех, кто боится, красивая прогулка с вожатыми.',
  ),
  L(
    'Macedonian cooking workshop (pastrmajlija), then learning the oro folk dance with an experienced teacher. Campfire.',
    'סדנת בישול מקדונית (פסטרמליה) ולימוד ריקוד האורו המסורתי עם מורה מנוסה. מדורה.',
    'Кулинарный мастер-класс (пастрмайлия), затем народный танец оро с опытным педагогом. Костёр.',
  ),
  L(
    "A day on a secret beach on the far side of the lake that even locals don't know — games, water activities and SUPs. Photo-hunt contest in the evening.",
    'יום בחוף סודי בצד השני של האגם שאפילו המקומיים לא מכירים – משחקים, פעילויות מים וסאפים. בערב – תחרות הצילומים הגדולה.',
    'День на секретном пляже на другом берегу озера, о котором не знают даже местные: игры, вода и сапы. Вечером — большой фотоконкурс.',
  ),
  L(
    "Art activity — painting the beautiful Macedonian landscape — then a boat ride and the camp's last water activity.",
    'פעילות אמנות – ציור הנוף המקדוני היפה, ואחר כך שיט בסירה ופעילות המים האחרונה של המחנה.',
    'Рисуем македонские пейзажи, затем прогулка на лодке и последняя водная активность лагеря.',
  ),
  L(
    'A secret competition between the groups, a wrap-up activity and the farewell party.',
    'תחרות סודית בין הקבוצות, פעילות סיכום ומסיבת פרידה מהמחנה.',
    'Секретное соревнование между группами, подведение итогов и прощальная вечеринка.',
  ),
  FLIGHT_HOME,
];

export const MOLDOVA: LocalizedText[] = [
  L(
    'Arrival and check-in, lunch, an icebreaker opening activity and an open-air escape-room mission in the Valley of Roses park.',
    'הגעה ורישום, ארוחת צהריים, פעילות פתיחה ומשימת אסקייפ רום פתוחה בעמק הורדים.',
    'Приезд и заселение, обед, вечер знакомств и квест под открытым небом в парке «Долина роз».',
  ),
  L(
    'A tour of central Chișinău and its history — an old Balkan city, under Romanian rule and later a Soviet capital — then a photo challenge and treasure hunt in Ștefan cel Mare Park. Team games.',
    'סיור במרכז קישינב וההיסטוריה שלה – עיר עתיקה בבלקן, תחת שלטון רומני וכבירה סובייטית, ואז אתגר צילום וחפש את המטמון בפארק שטפן צ׳ל מארה. משחקי גיבוש.',
    'Экскурсия по центру Кишинёва и его истории — старинный балканский город, румынский период и советская столица, затем фоточеллендж и поиск сокровищ в парке Штефана чел Маре. Командные игры.',
  ),
  L(
    'The butterfly park — one of the biggest tropical greenhouses in the Balkans — then lunch at the amusement park and a boat ride on the lake. Mafia game.',
    'פארק הפרפרים – מהחממות הטרופיות הגדולות בבלקן, ואז צהריים בפארק השעשועים ושיט בסירות על האגם. משחק מאפיה.',
    'Парк бабочек — одна из крупнейших тропических оранжерей на Балканах, затем обед в парке аттракционов и катание на лодках по озеру. «Мафия».',
  ),
  L(
    'Orheiul Vechi natural canyon — a real cave monastery, stunning views and a challenging but beautiful hike. Evening walk in the old village of Butuceni, where life goes on as it did centuries ago.',
    'הקניון הטבעי אורהיול וקי – מנזר מערות אמיתי, נופים מדהימים ומסלול מאתגר ויפה. בערב – סיור בכפר העתיק בוטוצ׳ני, שבו חיים כמו לפני מאות שנים.',
    'Каньон Старый Орхей: настоящий пещерный монастырь, потрясающие виды и непростой, но красивый поход. Вечером — старинное село Бутучень, где живут как столетия назад.',
  ),
  L(
    'Moldovan cooking workshop (traditional pancakes), learning the Moldovan hora with a certified teacher and a traditional crafts workshop. Disco and campfire.',
    'סדנת בישול מולדובי (פנקייקים מסורתיים), לימוד ריקוד ההורה המולדובי עם מורה מוסמך וסדנת אמנות מסורתית. דיסקו ומדורה.',
    'Мастер-класс молдавской кухни (традиционные блинчики), молдавская хора с педагогом и мастер-класс народного ремесла. Дискотека и костёр.',
  ),
  L('A full day at the Aqua City water park. Movie night.', 'יום שלם בפארק המים אקווה סיטי. ערב סרט.', 'Целый день в аквапарке Aqua City. Вечер кино.'),
  L(
    'Camp olympiad — sports contests, frisbee, a water fight and a photo challenge. Games evening.',
    'אולימפיאדת המחנה – תחרויות ספורט, פריסבי, קרב מים ואתגר צילום. ערב משחקים.',
    'Олимпиада лагеря: спортивные соревнования, фрисби, водная битва и фоточеллендж. Вечер игр.',
  ),
  L(
    'Cricova — a town that is largely underground, with underground art galleries and a mission game around the town. Mafia game between the groups.',
    'קריקובה – עיר שרובה מתחת לאדמה, גלריות אמנות תת-קרקעיות ומשחק משימות ברחבי העיר. משחק העיירה בין הקבוצות.',
    'Крикова — город, большая часть которого под землёй: подземные арт-галереи и квест по городу. «Мафия» между группами.',
  ),
  L(
    'Hollywood day — write a script, design the set, act and shoot a film together. Boat ride on the lake and sunset at the Valley of Roses.',
    'יום הוליווד – כותבים תסריט, מעצבים תפאורה, משחקים ומצלמים סרט יחד. שיט בסירות ושקיעה בעמק הורדים.',
    'Голливудский день: пишем сценарий, делаем декорации, играем и снимаем фильм. Прогулка на лодках и закат в «Долине роз».',
  ),
  L(
    'Beach volleyball at Vadul lui Vodă beach and water competitions between the groups. Campfire.',
    'כדורעף חופים בחוף ואדול לוי וודה ותחרויות מים בין הקבוצות. מדורה.',
    'Пляжный волейбол в Вадул-луй-Водэ и водные соревнования между группами. Костёр.',
  ),
  L(
    "The Chișinău Grand Prix — a day of crazy, creative missions around the city: secret places even locals don't know, special Moldovan products and meeting locals, ending with a pizza night.",
    'גרנד פרי קישינב – יום של משימות מטורפות ויצירתיות ברחבי העיר: מקומות סודיים, מוצרים מולדוביים מיוחדים ומפגש עם מקומיים, ובסוף ערב פיצה.',
    'Гран-при Кишинёва: день безумных творческих заданий по городу — тайные места, особые молдавские продукты, знакомство с местными и вечер пиццы.',
  ),
  L('A horse-riding day in a countryside village.', 'יום רכיבה על סוסים בכפר.', 'День верховой езды в деревне.'),
  L(
    'Ropes park in the Valley of Roses, a wrap-up activity with the screening of the camp film, and the farewell party.',
    'פארק חבלים בעמק הורדים, פעילות סיכום והקרנת סרט המחנה, ומסיבת פרידה.',
    'Верёвочный парк в «Долине роз», подведение итогов с показом фильма лагеря и прощальная вечеринка.',
  ),
  FLIGHT_HOME,
];

export const BELARUS: LocalizedText[] = [
  L(
    'Arrival and settling in, meeting the group, an adventure walk around Dokora village and an evening with the counselors.',
    'הגעה והתארגנות, היכרות עם הקבוצה, טיול הרפתקני בסביבת הכפר דוקורה ומפגש עם המדריכים.',
    'Приезд и заселение, знакомство с группой, прогулка-приключение по окрестностям деревни Докора и вечер с вожатыми.',
  ),
  L(
    'A traditional blacksmith workshop and Belarusian pottery. Campfire.',
    'סדנת נפחות מסורתית וסדנת קדרות בלארוסית. מדורה.',
    'Мастер-класс по кузнечному делу и белорусской керамике. Костёр.',
  ),
  L(
    'A full day at Gala Park — ropes courses, laser tag and a zip line. Mafia or city game.',
    'יום כיף בגאלה פארק – מסלולי חבלים, לייזר טאג ואומגה. משחק מאפיה או משחק עירוני.',
    'Целый день в «Гала Парке»: верёвочные трассы, лазертаг и зиплайн. «Мафия» или городская игра.',
  ),
  L(
    'A woodworking workshop to make a personal project, then Hollywood day — start preparing the camp film festival: brainstorming, scripts and roles. Evening team game.',
    'סדנת נגרות ויצירת פרויקט אישי, ואז אירוע הוליווד – מתחילים להכין את פסטיבל הסרטים: סיעור מוחות, תסריטים וחלוקת תפקידים. משחק קבוצתי בערב.',
    'Столярная мастерская и личный проект, затем голливудский день — готовим кинофестиваль лагеря: мозговой штурм, сценарии и роли. Вечерняя командная игра.',
  ),
  L(
    'Central Minsk — the old church and the historic upper town — then go-karting, Gorky Park and an evening walk through beautiful Minsk.',
    'סיור במרכז מינסק – הכנסייה העתיקה והרובע ההיסטורי, ואז קארטינג, פארק גורקי וסיור ערב במינסק.',
    'Центр Минска — старинный храм и Верхний город, затем картинг, парк Горького и вечерняя прогулка по Минску.',
  ),
  L('A full day of rafting and a barbecue evening.', 'טיול רפטינג של יום שלם וערב ברביקיו.', 'Целый день рафтинга и вечер барбекю.'),
  L(
    'A walk along the Svislach river with orienteering practice, a chocolate-making workshop and a games night.',
    'הליכה לאורך נהר הסביסלוץ׳ ותרגול ניווט, סדנת הכנת שוקולד וערב משחקים.',
    'Прогулка вдоль Свислочи с ориентированием, мастер-класс по шоколаду и вечер игр.',
  ),
  L(
    'BELAZ truck world — a tour of the giant-truck factory to see how they are built, and even a try at driving one. Mafia game between the groups.',
    'עולם המשאיות של BELAZ – סיור במפעל המשאיות הענקיות ואפילו ניסיון לנהוג באחת. משחק מאפיה בין הקבוצות.',
    'Мир БелАЗа: экскурсия на завод гигантских самосвалов и даже попытка порулить одним из них. «Мафия» между группами.',
  ),
  L(
    'Design day — personalised T-shirts and tote bags — then a photo session and film-festival preparations. Campfire.',
    'יום עיצוב – חולצות ותיקי בד בעיצוב אישי, ואז סשן צילומים והכנות לפסטיבל הסרטים. מדורה.',
    'День дизайна: футболки и сумки с собственным дизайном, затем фотосессия и подготовка к кинофестивалю. Костёр.',
  ),
  L(
    "The camp's big olympiad — sports and exciting competitions — then more filming and a Mafia game.",
    'האולימפיאדה הגדולה של המחנה – ספורט ותחרויות מרגשות, ואחר כך המשך צילומי הסרט ומשחק מאפיה.',
    'Большая олимпиада лагеря — спорт и захватывающие соревнования, затем съёмки фильма и «Мафия».',
  ),
  L(
    'Horse riding — learning to care for horses and ride them.',
    'רכיבה על סוסים – לומדים לטפל בסוסים ולרכוב עליהם.',
    'Верховая езда — учимся ухаживать за лошадьми и ездить верхом.',
  ),
  L(
    'The "Different Route" film festival and awards ceremony, games at the Boyarsky marina and a talent show.',
    'פסטיבל הסרטים "מסלול אחר" וטקס הענקת פרסים, משחקים בנמל בויארסקי ומופע כישרונות.',
    'Кинофестиваль «Другой маршрут» и награждение, игры на Боярской пристани и шоу талантов.',
  ),
  L(
    "Lebyazhy water park, lunch, shopping in Minsk and the camp's closing party.",
    'פארק המים לביאז׳י, ארוחת צהריים, קניות במינסק ומסיבת סיום המחנה.',
    'Аквапарк «Лебяжий», обед, шопинг в Минске и закрытие лагеря.',
  ),
];

/** The UK pages publish a typical week, shared by the London, Kent and Scotland camps. */
export const UK_TYPICAL_WEEK: LocalizedText[] = [
  L(
    'Arrival and check-in, lunch, an icebreaker opening activity and sports team games.',
    'הגעה ורישום, ארוחת צהריים, פעילות פתיחה ומשחקי גיבוש ספורטיביים.',
    'Приезд и заселение, обед, вечер знакомств и спортивные командные игры.',
  ),
  L(
    'Team-building day — English lessons, dodgeball and other ball games, an art workshop and team games.',
    'יום גיבוש – לימוד אנגלית, מחניים ומשחקי כדור, סדנת אמנות ומשחקי גיבוש.',
    'День сплочения: английский, вышибалы и другие игры с мячом, арт-мастерская и командные игры.',
  ),
  L(
    'English culture day — English lessons, the camp pop quiz and rounders, a traditional English game.',
    'היכרות עם תרבות אנגליה – לימוד אנגלית, חידון המחנה וראונדרס, משחק אנגלי מסורתי.',
    'День английской культуры: английский, викторина лагеря и раундерс — традиционная английская игра.',
  ),
  L(
    'London (Edinburgh at the Scotland camp) — a full day: the guards at Buckingham Palace, Big Ben, the London Eye, Covent Garden and Chinatown. Movie night.',
    'לונדון (אדינבורו במחנה בסקוטלנד) – יום שלם: השומרים בארמון בקינגהאם, ביג בן והגלגל הענק, קובנט גארדן והרובע הסיני. ערב סרט.',
    'Лондон (в шотландском лагере — Эдинбург): целый день — караул у Букингемского дворца, Биг-Бен, «Лондонский глаз», Ковент-Гарден и Чайнатаун. Вечер кино.',
  ),
  L(
    "Water and fun — English lessons, the camp's private pool and a scone-baking workshop, just like in old England. Disco.",
    'יום מים וכיף – לימוד אנגלית, בריכת המחנה הפרטית וסדנת אפיית סקונס מסורתיים. דיסקו.',
    'Вода и веселье: английский, собственный бассейн лагеря и мастер-класс по выпечке сконов. Дискотека.',
  ),
  L(
    'History day — English lessons and a trip to Winchester to see its medieval remains and how locals live away from the tourist crowds. Disco.',
    'יום היסטורי – לימוד אנגלית וטיול לוינצ׳סטר: שרידים מימי הביניים ואורח החיים המקומי הרחק מהתיירים. דיסקו.',
    'День истории: английский и поездка в Винчестер — средневековые памятники и жизнь горожан вдали от туристов. Дискотека.',
  ),
  L(
    "Nature day — English lessons and a visit to a botanical garden full of plants, flowers and trees we've never heard of. Ball games and a group competition in the evening.",
    'יום טבע – לימוד אנגלית וביקור בגן בוטני עם צמחים, פרחים ועצים שלא שמענו עליהם. בערב – משחקי כדור ותחרות בין הקבוצות.',
    'День природы: английский и ботанический сад с невиданными растениями, цветами и деревьями. Вечером — игры с мячом и соревнование групп.',
  ),
];
