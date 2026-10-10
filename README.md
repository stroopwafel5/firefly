# Firefly — Explore the world. Like a local.

An Android app (React Native / Expo) for **Different Route**, with four parts:

| Tab | What it does |
|---|---|
| **Camps** (orange) | Different Route's 16 summer camps with real photos and day-by-day itineraries from differentroute.net; filters by name, date, price and price range, age range and country; the full JotForm registration in the app; payment by PayPal, or bank transfer (the summary is e-mailed to Different Route); favourites. |
| **Weekend** (purple) | Real, in-person local events anywhere in the world (not only weekends), on a large map with pins and as a filterable list. Every event links to its official page and where to book, and every photo to the page it comes from. No AI events or photos. Admins can add events. |
| **Trip Planner** | Day-by-day plans from your choices (cities, travellers, interests, dates, events on/off, kid-friendly, car or public transport, daily hours) with attractions, events, restaurants, hotels and travel times. Drag and drop, remove, move to another day, favourites. Family trips also get a pink kids' plan with a sourced fun fact about each place. |
| **Me** | Booked and favourite camps, events and trips; find people, add friends, chat with them, add them to trips; in-app notifications. |

The app is in **English, Hebrew (right-to-left) and Russian**.

**→ Testing, API set-up, and how the trip planner decides: [HOW_TO_TEST.md](HOW_TO_TEST.md)**

---

## Quick start

```bash
npm install && npm --prefix functions install
npm test && npm run test:functions      # unit tests
npm run explain                          # watch the trip planner think (no keys needed)
npm run check:apis                       # live check of every API key
```

**API keys.** Firefly's TripAdvisor, Ticketmaster, SerpApi, PayPal, Anthropic and Google server
keys are already in `functions/.secret.local`, and the server settings are in `functions/.env`.
Upload them to Firebase with `npm run push-secrets`. The app settings are in `.env`: the Google Maps
key and the Firebase web app's ID are in; its apiKey comes from the web app's Config block via
`npm run firebase-config`. HOW_TO_TEST.md §2 lists each key, its tested status, and what is still
needed (the Firebase apiKey, the SMTP account, Anthropic credit). It also covers applying for Agoda.

> ⚠️ `functions/.secret.local` and HOW_TO_TEST.md contain live keys. Keep the project private;
> rotate the keys if it is ever shared publicly. They are server secrets and never go into the APK.

To run the app you need a Firebase project: see HOW_TO_TEST.md §2–3. Then:

```bash
npm run firebase-config     # .env already has the Maps key; this adds the Firebase web config
npx expo run:android        # dev build on an emulator or a USB-connected phone
```

**Seeing the app on an Android emulator (Windows)**

A *development* build contains no screens of its own: it downloads them from the Expo
development server (Metro) on your PC. If Metro isn't running you get "There was a problem loading
the project … SocketException". Either:

- **Standalone build, no server needed:** `npx expo run:android --variant release` builds an APK
  with the screens inside and installs it on the running emulator. The first time takes 10–20
  minutes.
- **Development mode, with live reload:**
  1. Run `npx expo start --dev-client` and leave that terminal open.
  2. In the Firefly app on the emulator, tap the server it lists (`http://10.0.2.2:8081`), or press
     `a` in the terminal. The first load takes a few minutes.
  3. If the app can't connect, run `adb reverse tcp:8081 tcp:8081` and tap **Reload**. Also allow
     Node.js through the Windows Firewall when Windows asks.

On the emulator, set a location (⋯ → Location → **Set location**) so the Weekend tab can search
near "you"; without one it uses the last area searched, or Tel Aviv, after 6 seconds.

Run these from the project folder (`C:\firefly`), not from `android`. In PowerShell, type
`npm.cmd`, `npx.cmd` and `firebase.cmd` (Windows blocks the plain `npm` script).

If a release build stops at `lintVitalAnalyzeRelease` with **"Metaspace"**, Gradle ran out of
memory. Give it more, stop the old Gradle process, and build again:

```powershell
(Get-Content android\gradle.properties) -replace '^org\.gradle\.jvmargs=.*','org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m' | Set-Content android\gradle.properties
android\gradlew.bat --stop
npx.cmd expo run:android --variant release
```

(`app.config.ts` sets the same values whenever the `android` folder is generated afresh.)

The app opens on a **log-in page** (log in, create an account, or *Continue as guest*), then a
**start screen** with four tiles: Camps, Events, Trips and My profile. Account holders skip the
log-in page next time; guests see it each time the app starts. In Firebase, enable both
**Email/Password** and **Anonymous** sign-in (Authentication → Sign-in method).

Without a Firebase project the app runs in **preview mode**: camps and the built-in events work,
and a strip under each title says the server isn't connected. Without a Maps key, map screens show
a notice instead of a map. If anything crashes, the error is shown on screen instead of a blank
page.

**Accessibility, step by step.** Needs: autism, ADHD, hard of hearing, blind or low vision, mental
health, physical disability, intellectual disability — each handled on its own.
- Camps filter on `disability` (every chosen need must be supported).
- The trip planner uses them **only when chosen**. Four can be checked at venues (blind, hearing,
  autism, physical): the server reads each place's own website — its accessibility page — for
  wording specific to that need, and also uses records from disability and tourism organisations
  (Access Israel, Israel Nature and Parks Authority, Tourisme & Handicap, Reisen für Alle, IBCCES
  Certified Autism Centers, AccessAble, Euan's Guide…), added with `npm run accessibility`. Every
  confirmation keeps its source link. All seven needs slow the pace (fewer places a day, a quiet
  break after each visit).

**Building an APK / Play Store bundle** ([EAS Build](https://docs.expo.dev/build/introduction/)):

```bash
npm i -g eas-cli && eas login
eas init                                   # once: creates the EAS project id → put it in .env
eas env:create   # add each variable from .env.example (or set them in the expo.dev dashboard)
npm run build:apk        # installable APK for testers
npm run build:android    # AAB for Google Play
```

After the first build, add the EAS signing certificate's SHA-1 to the Google Maps Android key
restriction, or the map stays blank.

## Project layout

```
App.tsx, index.ts            entry: providers (i18n, auth) + navigation
app.config.ts, eas.json      Expo / EAS configuration (package net.differentroute.firefly)
src/
  models/                    the spec's classes: Camp, CampElement, CampPage, Event, EventElement,
                             Location, Trip, DayPlan, Attraction(+Element), Restaurant(+Element),
                             Hotel(+Element), User
  data/                      camps + itineraries (from differentroute.net), JotForm terms,
                             20 hand-verified bundled events, trip-type photo sources
  planner/                   the trip planner: pure TypeScript, no network (unit-tested)
    generator.ts               whole trip: day bases, pools, scoring, per-day loop
    scheduler.ts               one day: greedy builder, meals, drag & drop checks
    route.ts (where each day is; the greedy order), classify.ts, geo.ts, time.ts, travel.ts, kidify.ts, dayEdit.ts
  services/                  Firebase, typed Cloud Function calls, events, bookings, social, Wikipedia
  screens/                   camps/, weekend/, planner/, user/
  components/                photo carousel with credits, date picker, time-range slider, signature pad…
  i18n/                      en.ts (source), he.ts, ru.ts, plurals, dates, RTL switching
functions/src/               Cloud Functions (all third-party keys live here)
  google.ts                    geocoding, road route, travel-time matrix (Routes API)
  tripadvisor.ts               Tripadvisor Terra API: attractions, restaurants, hotels, photos, reviews;
                               adds new areas to the account's allowlist (+ tripadvisorMap.ts)
  attractions/                 free backup sources: Wikidata attractions (live + 5,000-place Europe list,
                               refreshed nightly), OpenStreetMap restaurants; merging with Tripadvisor
  rateGate.ts                  keeps Tripadvisor under its requests-per-second limit, pauses after a 429
  hotels/                      hotelsNear: Agoda → Google Hotels → TripAdvisor, one search per stay
  serpBudget.ts                keeps SerpApi within its monthly searches (free plan: 250)
  geo/nominatim.ts             OpenStreetMap fallback geocoder
  events/                      live event search (SerpApi Google events, Ticketmaster, admin events),
                               validation, weekly 150-event fallback (50 in Israel)
  paypal.ts, bookings.ts       payments and booking e-mails
  social.ts, misc.ts           friends, notifications, "I'm going", kids' rewording, photo reports
scripts/                     seedFirestore.ts, setAdmin.ts, explainTrip.ts, checkApis.ts (live key check),
                             pushSecrets.mjs (keys → Secret Manager), agodaCity.ts (Agoda city ids)
tests/, functions/test/      unit tests (node:test)
firestore.rules, storage.rules, firestore.indexes.json
```

## How it fits together

```
 Android app (Expo)                 Firebase                          Outside services
 ─────────────────                  ────────                          ────────────────
 Camps, Weekend, Planner, Me  ──►  Auth (email + guest)
                              ──►  Firestore (camps, events, trips,
                                   users, chats, bookings, cache)
                              ──►  Storage (passports, avatars)
                              ──►  Cloud Functions (europe-west1) ──► Tripadvisor Terra API
                                                                  ──► Google Geocoding + Routes
                                                                      (OpenStreetMap if no key)
                                                                  ──► SerpApi (Google events,
                                                                      Google Hotels prices)
                                                                  ──► Agoda affiliate API
                                                                  ──► Ticketmaster Discovery
                                                                  ──► PayPal Orders v2
                                                                  ──► SMTP (booking e-mails)
                                                                  ──► Anthropic (optional)
 Wikipedia REST (from the phone: kids' texts, fun facts, trip-type photos)
 Google Maps SDK (the map), Booking.com / TripAdvisor (opened in the browser)
```

- **Keys:** only the Maps Android key and the public Firebase config are in the app. Every other key is a
  Cloud Functions secret.
- **Caching:** functions cache provider answers in Firestore (`cache/`): event searches for 6 hours,
  nearby lists for 1 day, place details and routes for 7 days, geocoding for 30 days.
- **Planner:** the planner code runs **on the phone**. It only fetches data through
  the functions, so the same code runs in tests and in `scripts/explainTrip.ts`.

### Events: "physical and verifiable", worldwide

Precomputing every event on Earth isn't possible, so Firefly searches **live** for whatever area and
dates the user asks for (Indonesia, Ghana and Nicaragua work the same as Tel Aviv). An event is
shown only if it has:
- a street address that geocodes to a map pin;
- nothing online, virtual, livestream or webinar (checked in English, Hebrew and Russian);
- an `http(s)` link to the organiser or ticket page;
- at least one photo, each with the page it was published on and a credit.

Google listings get the event page's own `og:image` instead of Google's thumbnail. Ticketmaster's
generic "fallback" artwork is rejected. The same rules are checked in the app, the admin form, the
server and the Firestore rules.

Without internet the app uses a weekly snapshot of 150 events for the next two weekends (50 in
Israel, 100 worldwide), built every Monday by `refreshFallbackEvents`, plus 20 hand-verified bundled
events. With no place typed, the search covers 100 km around the user.

### Trip planner in one paragraph

Trips last 1–30 days. Day by day, a greedy route walks from the start city towards the destination
(or around and back on a round trip): it stays in a city while it still has attractions rated 9.0+
or 7.0+ ones that fit the traveller's types, ages and accessibility needs, never more than 4 days
(world cities like Paris and London excepted), then moves to the next big city within a day's
travel (GeoNames list, bundled), with a day of its own for a world-class landmark on the way
(Plitvice). Attractions come from Tripadvisor merged with Wikidata (free backup, plus a 5,000-place
Europe-wide list), all on one 0–10 popularity scale, and each day takes them in this order:
popularity → accessibility fit → type/age fit → distance from the previous point. Each day is then
timed hour by hour with real travel times (Google Routes), opening hours, meals (Tripadvisor, or
OpenStreetMap when Tripadvisor is busy) and fixed-time events; one hotel per stay. The plan shows a
map of the whole route and a map of each day. The full explanation is in
[HOW_TO_TEST.md §6](HOW_TO_TEST.md#6-how-firefly-builds-a-trip).

## Data model: the spec and where Firefly differs

All the spec's classes exist in `src/models` with the spec's field names. `Camp` and `Event` have
getters, setters and `toElement()`. `ModeOfTravel` is `0` = car and `1` = public transport. Event
types are Family, Nature, History, Theatre, Festival, Food, Tour and Kid Friendly. These are the
deliberate differences:

| Spec | Firefly | Why |
|---|---|---|
| `Location(int locLat, int locLon)` | `number` (decimal degrees) | Integers can't hold map coordinates (Prague is 50.0875, 14.4213) |
| numeric ids everywhere | camps keep numeric ids; attractions, restaurants, hotels and events use **string** ids | They are the providers' ids (TripAdvisor, Ticketmaster…) |
| `photos` / `photo_urls` | kept, plus a parallel **`photoSources`** (`url`, `sourcePage`, `credit`, `license`) | So every photo can be traced to where it was published (the no-AI-photos rule) |
| `Restaurant`, `Hotel` without a name | **`name`** added; hotels also have `linkToListing` and `rating`; restaurants `cuisine`, `rating` | A list of restaurants needs names |
| `Attraction.openingHours: Time[]` | kept (a typical weekday), plus **`weeklyHours`** per weekday, `rating`, `numReviews`, `category`, `suggestedMinutes`, `address` | Real opening hours differ by weekday; the planner needs them |
| `Event` | adds `venue`, `address`, `startTime`, `endTime`, `bookingLink`, `priceText`, `origin`, `sourceName`, `datesConfirmed` | Needed to verify that an event is physical and to plan around its time |
| `DayPlan` | adds `date`, `slots` (the timed schedule), `anchor`/`anchorName` (base town), `base`, `travel` (saved travel times), `funFacts`, `kidTexts` | The spec's lists say *what*; slots say *when*; saved travel times let drag & drop work offline |
| `Trip` | adds `withEvents`, `kidFriendly`, `dayStart`, `dayEnd`, `ownerId`, `accessNeeds`, `accessStrict` | To re-plan and share a trip, and keep its accessibility choices |
| `Camp` | adds `provider: string` (default `"Differentroute"`) and `disability: string[]` (default empty) | Other organisers' camps (not bookable in the app yet) and disability support |
| `Attraction` | adds `website`, `disabilityCompatible: string[]` and `accessibilitySources` | Each confirmed need keeps the page that confirms it |
| `CampPage.dayByDayItinerary: string[]` | as spec, one string per day, rephrased from differentroute.net in all three languages | — |
| Chat | person-to-person chat only between **friends** | Spam and safety (children use the app) |
| `Time` | `"HH:MM"`; hours can go up to 25 ("25:00" = 1:00 the next morning) | The day can run to 01:00 |

Firestore stores `UserDoc` (ids, not nested objects) and the app resolves them.

## Admin tasks

| Task | How |
|---|---|
| Load or update the camp catalogue (and prices PayPal charges) | `npm run seed` (edit `src/data/camps.ts` first) |
| Make someone an admin | `npm run set-admin -- email@example.com` (they sign in again) |
| Add an event | In the app: Weekend → *Add an event* (admins only) |
| Rebuild the offline events now | Call `refreshFallbackNow` with an admin token (HOW_TO_TEST.md §5.2) |
| Build / rebuild the 5,000-attraction backup list | `npm run attractions:build` (safe to stop and rerun; the server refreshes old entries every night) |
| Tripadvisor's speed limit | `TRIPADVISOR_QPS` in `functions/.env` = your Terra plan's queries per second, then deploy the functions |
| Review reported photos | Firestore `photoReports`; delete `hiddenPhotos/<id>` to restore a photo |
| Broken camp pages | `checkCampPages` runs daily; see Firestore `campPageStatus` |
| Check that every API key still works | `npm run check:apis` (add `--no-serp` to save SerpApi searches) |
| Upload or change keys | Edit `functions/.secret.local` → `npm run push-secrets` → `firebase deploy --only functions` |
| Turn on Agoda for a destination | `npm run agoda-city -- <country> <Agoda city id> "<name>" …` (HOW_TO_TEST.md §2.4) |
| Mark a camp's disability support or organiser | Firestore `camps/<id>`: `disability` (e.g. `["autism","adhd"]`), `provider` (default `"Differentroute"`) |
| Record an organisation's accessibility confirmation for a place | `npm run accessibility -- add <tripadvisorId> <blind\|hearing\|autism\|physical> "<organisation>" <url>` |
| See health forms | Firestore `healthForms/<bookingId>` (parents and admins only) |
| Turn on card payments | Grow credentials → `functions/.secret.local` → `npm run push-secrets` → deploy (HOW_TO_TEST.md §7.3) |

## Things to know before launch

**Issues found on differentroute.net** (the app does not copy them):
- `/armenia-camp` returns 404, and the Netherlands camp has no page. Both show "itinerary not
  published yet" in the app.
- The Minsk (Belarus) itinerary repeats day 13 as day 14.
- China day 10 contains a stray "flight home" line; Moldova day 5 contains text copied from the Macedonia
  page. Both were left out.
- Some camp pages show sidebar photos of other camps. The app only uses each camp's own photos.

**Photo credits for the 20 bundled events:** credits and source pages are shown for every photo.
Three photographer names were read from the image file names on the publishers' sites (Signal
Festival: Jan Hromádko; Hunt Kastner: Jan Kolský; Rudolfinum: Iris Ranzinger), and a few publishers
name no photographer. Please confirm these before launch. *Holiday of Holidays* (Haifa) and
*Sapporo White Illumination* are marked "dates to be confirmed".

**Coverage:** Ticketmaster has little in Israel (3 events around Tel Aviv in a month, tested
9 Oct 2026), so Israeli events come mostly from Google's listings via SerpApi. Hotels show live
prices per stay from Agoda (once Agoda approves the affiliate account) or Google Hotels, and
otherwise come from TripAdvisor with a pre-filled Booking.com search.

**Key status (tested 9–10 Oct 2026, HOW_TO_TEST.md §2.5):**
- **Ticketmaster:** works.
- **SerpApi:** works, but it is on the Free plan with 250 searches a month, so Firefly budgets them.
- **Anthropic:** the key is valid, but the account needs credit.
- **Tripadvisor:** the key is active on Tripadvisor's new **Terra** platform. Firefly was moved from
  the old Content API, which was switched off on 31 Aug 2026, to Terra. Not yet run live: run
  `npm run check:apis -- --only tripadvisor`.
- **PayPal:** couldn't be reached from the build machine; run `npm run check:apis -- --only paypal`.

**Tripadvisor terms to confirm:**
- **Storage:** Terra's caching policy allows storing only place IDs unless your contract says
  otherwise. The server never caches Tripadvisor content. But a **saved trip** keeps the names,
  descriptions and photo links of its places, so it works offline and with drag and drop. Ask
  Tripadvisor whether that is allowed for a user's own saved itinerary. If it isn't, saved trips
  can be changed to keep only place IDs and re-fetch the details when opened, at extra cost per
  opening.
- **Cost:** Terra bills every place returned. The 1,000 free places are a one-time allowance, after
  which it costs about $0.50–1.20 per planned trip (HOW_TO_TEST.md §10). Set a daily budget in the
  Terra dashboard.

**Offline:** an open trip keeps working offline (travel times are stored with it), and Weekend falls
back to saved events. Reopening *My trips* after a restart needs the internet.

**Costs:** see HOW_TO_TEST.md §10. The Google Routes matrix (per planned day) and SerpApi (live and
weekly searches) are the main costs.

**Not yet run:** this repository was written and verified with type-checks and unit tests, but
without `npm install` or a device build. Run `npm install`, `npm run typecheck` and a first
`npx expo run:android` before handing it to testers.
