# Firefly — How to test

This guide is for anyone testing Firefly: QA, developers, or a Different Route team member who wants
to check the app before it goes to customers. It covers:

1. [What you can test without any keys](#1-test-in-5-minutes-no-keys-needed) (5 minutes)
2. [API keys: Firefly's keys, what's still needed, Agoda, test results](#2-api-keys-and-accounts)
3. [Running everything locally with the Firebase emulators](#3-run-locally-with-the-firebase-emulators)
4. [Calling every API by hand](#4-calling-the-apis-by-hand) with `curl`, with what to check in each answer
5. [Testing events: live worldwide search, the weekly offline fallback, "physical and verifiable"](#5-events-live-search-offline-fallback-verification)
6. [**How Firefly builds a trip**](#6-how-firefly-builds-a-trip): the planning algorithm in plain language, with a worked example, so you can explain *why* every plan looks the way it does
7. [Camps, booking, PayPal and bank transfer](#7-camps-booking-and-payment)
8. [Friends, chat and notifications](#8-friends-chat-and-notifications)
9. [On-device checklist](#9-on-device-checklist) (languages and RTL, drag and drop, kids' plan, offline)
10. [Costs, quotas and troubleshooting](#10-costs-quotas-and-troubleshooting)

Everything below assumes a terminal in the project folder (`firefly/`), Node 22, and
[`jq`](https://jqlang.org/) for reading JSON.

---

## 1. Test in 5 minutes (no keys needed)

```bash
npm install
npm --prefix functions install

npm test                 # 34 app tests: planner, hotels per stay, drag & drop rules, data, translations
npm run test:functions   # 21 server tests: real Ticketmaster answers, Google events/hotels, Agoda, TripAdvisor,
                         #   PayPal, SerpApi budget, weekly fallback plan (150 = 50 Israel + 100 world)
npm run typecheck        # TypeScript for the app
npm --prefix functions run build   # TypeScript for the Cloud Functions

npm run explain          # builds a 3-day family trip in a fictional town and explains every decision
npm run check:apis       # live check of every API key (§2.5); needs internet
```

`npm run explain` is the fastest way to understand the trip planner. It runs the real planning code on
**"Testville"**, a made-up town with 13 attractions, 6 restaurants, 2 hotels and 3 events (all fictional
and used only by this script), and prints each day's scores and every decision. Section 6 walks
through its output. Change the inputs to see how the plan reacts:

```bash
npm run explain -- --kids 0 --types Food,Nature --day-start 10:00 --day-end 23:00
npm run explain -- --must-see "Fun Valley"          # force the far-away theme park in
npm run explain -- --mode transit --no-events
npm run explain -- --days 1 --start 2026-10-17       # a single Saturday
```

---

## 2. API keys and accounts

> ⚠️ **This section and `functions/.secret.local` contain Firefly's real keys.** Share this guide
> and the project only with people who should have them. If either ever ends up somewhere
> public (a public repository, a forum post), rotate every key in its provider's portal.

Only two keys ship **inside the app**: the Google Maps Android key and the public Firebase config.
Every other key is a **server secret**. The phone never sees it, so it can't be pulled out of the APK.
Firefly's keys are already filled in:

- **`functions/.secret.local`** holds the secret keys. The local emulator reads it directly, and
  `npm run push-secrets` uploads it to Google Secret Manager for the deployed functions.
- **`functions/.env`** holds the non-secret settings: PayPal environment, booking e-mail address,
  and the SerpApi budget.

### 2.1 Firefly's keys and their status

| Service | Key | Stored as | Status (tested 9–10 Oct 2026, see §2.5) |
|---|---|---|---|
| **Tripadvisor** (Terra API) | `7929df91-b531-4657-bca8-eb54a5b168d8` | `TRIPADVISOR_KEY` | ✅ **Active key on the Terra platform** (Discover plan, 1,000 free places). The first tests failed because Firefly still called Tripadvisor's old Content API, which was switched off on 31 Aug 2026; Terra keys don't work there. **Firefly now uses Terra** (§4.3). Terra keys have no domain/IP settings, so there is nothing to configure. Not yet run live: run `npm run check:apis -- --only tripadvisor`. |
| **Ticketmaster** Consumer Key | `xREXX2fJE9j3UZpybMKnkOBTiFbaa1RE` | `TICKETMASTER_KEY` | ✅ **Works.** London, Prague and Tel Aviv searches answered |
| Ticketmaster Consumer Secret | `iNPYpRNVg4jTnYVs` | `TICKETMASTER_SECRET` | Not needed: the Discovery API only uses the Consumer Key. Kept for the record. |
| **SerpApi** | `7cb8804eea01d29d9025b64311e2f1526ca61d0305f69c4e78d999cf66d136cc` | `SERPAPI_KEY` | ✅ **Valid.** Free Plan: **250 searches a month**, renewing on the 9th. Firefly budgets them (§10). |
| **PayPal** Client ID | `BAAFH266M6z4DGS3iy5ToYur1bzOxIWGATyt79TdLkDO9fX5PIDp-nx3MtsfSiF5uguzRfN9934_XXgqH8` | `PAYPAL_CLIENT_ID` | ❓ Not testable from the test machine (PayPal blocks automated access). Run `npm run check:apis -- --only paypal`: it tells you whether these are **sandbox** or **live** keys and sets up a test order. Note: most PayPal client IDs start with "A"; if the check fails, copy the ID again from Apps & Credentials. |
| PayPal Secret | `EE6CRIO90z95P5WM4jlMw_gQ882FD3oQ8p0qyDQvZ8C2LMfErXbTPv2zwT9Xg9ZmbkR6yCgvvKAATupR` | `PAYPAL_CLIENT_SECRET` | ❓ as above. `PAYPAL_ENV` in `functions/.env` is `sandbox`; set it to `live` if the check says so. |
| **Anthropic** | `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` | `ANTHROPIC_API_KEY` | ✅ Key valid and `claude-haiku-5-5` available. ❌ **The account has no credit** ("Your credit balance is too low"). Add credit at [console.anthropic.com](https://console.anthropic.com) → Plans & Billing. Until then kids see the Wikipedia text as is; nothing breaks. |
| **Google Maps** (in the app, key 1) | `AIzaSyCDGLApvUKGn9_084bSOeOoW_tUr_yNz64` | `GOOGLE_MAPS_ANDROID_KEY` in `.env` | ✅ Restricted correctly: refuses web requests ("not authorized to use this service"), as a key locked to the Android app should. It shows the map once the app is rebuilt. |
| **Google server key** (key 2) | `AIzaSyCH4HbfhRVtiC-eYgEW81DDn7mRnWHm8O0` | `GOOGLE_SERVER_KEY` | ✅ Geocoding works ("Granada, Nicaragua" → 11.883, −85.951; tested 10 Oct 2026). Routes API: run `npm run check:apis -- --only geocoding` after deploying, or plan a trip and look for travel times without "(estimate)". |
| **Firebase web app** "firefly" | apiKey `AIzaSyDgp53oKSpQzzIHrVXx2T01Mg0rGzDLCME`, project `dreamroute-firefly` (number 838969269106), app ID `1:838969269106:web:30b46d18b6002ff7129beb` | `FIREBASE_*` in `.env`; `.firebaserc` | ✅ Key belongs to dreamroute-firefly and Authentication answers (authorized domains: localhost, dreamroute-firefly.firebaseapp.com, dreamroute-firefly.web.app; tested 10 Oct 2026). The app leaves preview mode on the next build. |
| **Agoda** affiliate | *(not issued yet)* | `AGODA_SITE_ID`, `AGODA_API_KEY` | ⏳ Apply first (§2.4). The code is ready and switches on as soon as both are filled in. |

### 2.2 Still needed

| What | Where | Without it |
|---|---|---|
| **Firebase services** | ✅ Web config is in `.env` (§2.1). If the project ever changes: the project (Blaze plan) and the web app "firefly" exist. Firebase console → ⚙ **Project settings** → **General** → *Your apps* → **firefly** → *SDK setup and configuration* → pick **Config** (not npm). Paste that block into a file called `firebase-config.txt` next to `package.json` and run **`npm run firebase-config`**: it fills the `FIREBASE_*` lines of `.env` (apiKey, authDomain, projectId, storageBucket) and writes `.firebaserc`. It refuses a block from a different project. (`service-account.json` is the admin key for `npm run seed`; it holds the project ID but **no** apiKey.) Also enable **Authentication** (Email/Password **and** Anonymous), **Firestore** and **Storage**. | The app stays in preview mode: no accounts, bookings or live server data. |
| **E-mail for bookings** | A Gmail account with 2-step verification → Google Account → Security → *App passwords* → `SMTP_USER` / `SMTP_PASS`. | Bank-transfer and PayPal booking summaries can't be e-mailed to dubinanna@gmail.com. |
| Anthropic credit | See §2.1 | Kids see the Wikipedia text unchanged |
| A Tripadvisor spending limit (recommended) | Terra dashboard → *Manage plan*: set a daily budget | Nothing breaks; it just caps the bill (§10) |
| Agoda credentials | §2.4 | Hotels come from Google Hotels (with prices) or TripAdvisor |
| Booking.com affiliate id (optional) | Booking.com Affiliate Partner programme → `BOOKING_AFFILIATE_ID` in `functions/.env` | Booking.com links work, without commission |

### 2.3 Upload the keys and deploy

```bash
npm i -g firebase-tools && firebase login
npm run firebase-config                  # .env + .firebaserc from firebase-config.txt (§2.2)
npm run push-secrets                     # uploads functions/.secret.local; empty keys become "unset"
firebase deploy --only firestore:rules,firestore:indexes,storage,functions
npm run seed                             # the 16 camps (and the prices PayPal charges)
npm run set-admin -- you@example.com
npm run attractions:build                # the 5,000-attraction backup list from Wikidata (once; safe to stop and rerun)
```

Always run `npm run push-secrets` before deploying when the server has new keys (it uploads empty
ones as a placeholder). Otherwise `firebase deploy` stops and asks for each missing key, and an empty
answer fails with *"Secret Payload cannot be empty"* — nothing is deployed.

`attractions:build` reads Wikidata (free, no key) from your computer: a map search around each of
the 438 cities and tourist towns, then the national parks, waterfalls, caves and reserves of each
country — 536 searches, one at a time (Wikidata's public service allows about one second of
searching per second). What to expect:

- A progress line every 10 searches, e.g. *"40/536 searches · 3 min so far · about 37 min left"*.
  Each search should take a few seconds. If the first progress lines say much more than an hour
  is left, Wikidata is slow today: stop it (Ctrl+C) and run it again later — nothing is lost.
- Every answer is saved in Firestore (`attractionSearches`) as soon as it arrives, so **Ctrl+C is
  always safe**: run the command again and it only does the searches that are still missing.
  `npm run attractions:build -- --fresh` runs all of them again.
- An occasional *"Lyon: … timeout — trying a lighter search"* is fine: it tries a smaller circle
  (then a smaller one) and carries on. *"skipped for now"* means the next run will try that one again.
- If 6 searches in a row get no answer, Wikidata is down or busy: the build stops by itself instead
  of waiting on every city. Try again later; it carries on where it stopped.
- At the end it saves the list to Firestore (`attractionCache/*`) and to
  `functions/data/attractions-europe.json` so you can open and check it.

After that the server keeps it fresh by itself: every night (`refreshAttractionCache`, 03:30 Israel
time) it re-runs the searches that are more than 30 days old, as many as fit in 20 minutes, and most
nights there is nothing to do. Until the first build, the planner still gets Wikidata places live
around each city.

**Tripadvisor's speed limit:** set `TRIPADVISOR_QPS` in `functions/.env` to the queries-per-second of
your Terra plan (Terra dashboard → *Manage Plan*; default 3) and redeploy the functions.

**After changing `.env` or `app.config.ts`** (e.g. the Google Maps key), regenerate the Android folder
before building, because `expo run:android` reuses an existing one as it is:
`npx.cmd expo prebuild --clean --platform android`, then `npx.cmd expo run:android --variant release`.

`seed` and `set-admin` sign in with `service-account.json` from the project folder (Project
settings → Service accounts → Generate new private key). The same commands work in PowerShell, cmd
and bash.

When a key arrives later (Agoda, the Google server key, SMTP), add it to `functions/.secret.local`,
run `npm run push-secrets` again, and redeploy.

**One IAM role to add:** the booking e-mail includes a 30-day link to the uploaded passport. Signing
that link needs the functions' service account (`<project-number>-compute@developer.gserviceaccount.com`)
to have **Service Account Token Creator** (IAM & Admin → IAM → grant).

### 2.4 Hotels: Agoda, Google Hotels, TripAdvisor

Booking.com's API isn't available to Firefly for now, so hotels come from three sources. For each
**stay** (consecutive nights in the same town), the server tries them in order:

1. **Agoda affiliate API** (the "Affiliate Lite" / Long Tail Search API): live prices for the
   exact dates and party, and a **Book on Agoda** button with Different Route's affiliate link.
   It needs Agoda credentials and Agoda's city id for the destination.
2. **Google Hotels** (via the SerpApi key you already have): live prices compared across Agoda,
   Booking.com, Expedia and hotel websites, and a button to the hotel's own website. Each stay
   uses 1 SerpApi search, within the monthly budget.
3. **TripAdvisor hotels:** no prices, and a pre-filled Booking.com search to book.

Every hotel card also has **Compare on Booking.com** (a search for the same hotel, dates and party).

**Getting Agoda access.** I prepared everything, but the application has to come from Different
Route, because it is a contract in the company's name (accepting Agoda's partner terms and giving
company and payout details):

1. Go to **[partners.agoda.com](https://partners.agoda.com)** → sign up as an **affiliate partner**.
   Use Different Route's company details, website `www.differentroute.net`, and the payout details
   for commissions.
2. When the account is approved, find the **Site ID** (CID) under *Profile → Manage My Sites*.
3. Ask your Agoda account manager, or support in the Partner Center, for: **access to the
   Affiliate Lite API (Long Tail Search API, `lt_v1`) and its API key**, the **HTTPS endpoint**,
   and the **list of Agoda city IDs** (the data feed) for your destinations. Text you can paste:

   > Different Route (www.differentroute.net) is an Israel-based travel company that runs
   > international summer camps and family trips, mainly for Russian-speaking families in Israel
   > and Europe. We are launching **Firefly**, an Android app that builds day-by-day trip plans
   > (attractions, local events, restaurants and one hotel per stay). We would like to show Agoda
   > prices for each trip's dates and party size and send travellers to Agoda to book through
   > our affiliate link. Please enable the Affiliate Lite API (lt_v1) for our Site ID, send the
   > API key and the HTTPS endpoint, and the city ID list for Europe, Israel and Asia.

4. Put the credentials in `functions/.secret.local` (`AGODA_SITE_ID=`, `AGODA_API_KEY=`), set
   `AGODA_ENDPOINT` in `functions/.env` if Agoda gives you an HTTPS address, then run
   `npm run push-secrets` and redeploy.
5. Register the Agoda city id for each destination, under every name the town goes by (the server
   looks the town up by its English name):
   `npm run agoda-city -- CZ <cityId> "Prague" "Praha"`. Then check it with
   `npm run check:apis -- --only agoda --agoda-city <cityId>`.

### 2.5 Test results and how to re-run them

Run every check yourself from any computer with normal internet access:

```bash
npm install
npm run check:apis                       # all services (uses 3 of the month's SerpApi searches)
npm run check:apis -- --no-serp          # same without spending SerpApi searches
npm run check:apis -- --only paypal      # one service
```

**Tripadvisor in depth, with no installation:** `node scripts/testTripadvisor.mjs` (Node 18+)
runs 25 live checks:
- whether the key is accepted;
- catalog search in Prague and in Tel Aviv (Hebrew);
- the allowlist;
- licensed nearby search in Russian and Hebrew, for attractions, restaurants and hotels, and what
  share of places have hours, categories, a visit length and a photo;
- paging and Terra's documented limits;
- place details, several places in one call, and photos;
- reviews in English, Hebrew and Russian;
- search by name.

It uses about 50 of the 1,000 free places. Every answer is saved in `tripadvisor-test-results/`
(never the key); zip that folder and send it back so Firefly's mapping can be checked against the
real answers.

`npm run check:apis` uses the keys in `functions/.secret.local` and the **same request and parsing
code as the server**. It prints PASS / FAIL / SKIP with sample data, and exits with an error if anything
failed. Each service is checked as follows:

| Service | Checks |
|---|---|
| Anthropic | Key valid; the configured model exists; kids' rewording of a Prague Castle text in English, Hebrew and Russian is in the right alphabet and adds no numbers that aren't in the source |
| Ticketmaster | London, Prague and Tel Aviv searches for the next two weekends: events kept, non-events dropped, every kept event passes the "physical and verifiable" rules |
| SerpApi | Free account check (plan, searches left); Google events for Accra (English) and Tel Aviv (Hebrew); Google Hotels prices in Prague for 2 adults + 2 kids |
| Tripadvisor | The key works (catalog search, Prague); places get added to the allowlist if needed; the licensed nearby search maps to a Firefly attraction (types, visit length, hours, photo); photos; Russian reviews each link to the review. Uses about 12 billable places. |
| PayPal | Credentials in the configured environment (and tells you if they belong to the other one); in sandbox, creates a €1 test order that is never captured |
| Agoda | When credentials exist: a city search for `--agoda-city` |
| Geocoding | Google (if the server key is set), and the OpenStreetMap fallback |

**What was run while adding the keys (9–10 Oct 2026).** The machine the app was built on can only
reach a few services directly, so some checks ran through a web-fetch tool instead:

| Service | Test | Result |
|---|---|---|
| Anthropic | `check:apis`: list models | ✅ 13 models, including `claude-haiku-5-5` |
| Anthropic | `check:apis`: kids' rewording in en / he / ru | ❌ `HTTP 400 — Your credit balance is too low to access the Anthropic API` (×3). The key is fine; the account needs credit. |
| Ticketmaster | London, 16–25 Oct, 30 km, exactly the server's parameters | ✅ 2,038 listings. Sample: *Hine After Hours* (Boisdale, Canary Wharf). Also returned *London Eye – Standard Experience* and *Madame Tussauds – Standard Entry*, which are attraction tickets, not events. **Fix added:** those are now dropped. |
| Ticketmaster | Prague, 16–25 Oct, 40 km | ✅ concerts at Cross Club, O2 Arena and Black Pes, and ice hockey at O2 Arena; *Jan Bendig* cancelled; *"Jan Bendig \| Fast Track"* and *"… \| BURGER JAKO PUK"* are add-on products. **Fix added:** add-ons are dropped. |
| Ticketmaster | Tel Aviv, 100 km, 16 Oct – 15 Nov | ✅ only **3** events in a month, and 2 of them have only generic artwork, so they're rejected (no real photo). This confirms Israeli events must come from Google listings (SerpApi). |
| Ticketmaster | Server code on those real answers (`npm run test:functions`, fixture `functions/test/fixtures/ticketmaster-2026-10-09.json`) | ✅ Prague keeps 4 and drops 2; London drops both attraction tickets; Tel Aviv keeps *Boy George* only; every kept event passes validation |
| SerpApi | Account check | ✅ Free Plan, 250 of 250 searches left, renews 9 Nov 2026 |
| SerpApi | Event and hotel searches | Not run here: SerpApi's search endpoint refuses automated fetch tools. The code is tested against SerpApi's documented response format (`npm run test:functions`); run `npm run check:apis` for a live run. |
| Tripadvisor | Old Content API: nearby search and location search | ❌ refused. That API was switched off on 31 Aug 2026 and doesn't accept Terra keys, which is why. |
| Tripadvisor | Terra API, live | Not run here: the build machine's network blocks terra.tripadvisor.com. Run `node scripts/testTripadvisor.mjs` (above). |
| Tripadvisor | Firefly's Terra logic against a **simulated Terra server** following the documented rules (`functions/test/terraFlow.test.ts`) | ✅ 7 tests: a new area is licensed once (catalog → allowlist → licensed search), billing 48 places for 24 rather than 80; the next trip to the same area skips the catalog and bills 24; more places wanted later or a month later → licenses again; radius, page-size and paging limits never exceeded; accounts without an allowlist go straight to search; a 403 (package without those endpoints) or a refused allowlist falls back to catalog data; details by ID license missing places and keep the order; allowlist calls de-duplicated and free. |
| Tripadvisor | `node scripts/testTripadvisor.mjs` run against a local mock of Terra | ✅ 24 passed, 1 warning (no Hebrew reviews, as set up in the mock); every answer saved; key never written to disk. This checks the test script itself. |
| PayPal | Token request | Not reachable from this machine; run `npm run check:apis -- --only paypal` |
| All | 34 app tests + 21 server tests + 4 type-checks | ✅ |

---

## 3. Run locally with the Firebase emulators

The emulators run Auth, Firestore, Storage and all Cloud Functions on your computer. External APIs
(TripAdvisor, Ticketmaster, SerpApi…) are still called for real, with the keys already in
`functions/.secret.local` (§2.1) and the settings in `functions/.env`.

```bash
npm i -g firebase-tools

# Build the functions and start everything (Emulator UI: http://127.0.0.1:4000)
npm --prefix functions run build
firebase emulators:start --project demo-firefly
```

In a second terminal, add the camps and an admin user:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-firefly npm run seed

curl -s "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"secret123","returnSecureToken":true}' | jq .localId
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=demo-firefly npm run set-admin -- admin@example.com
```

**Run the app against the emulators.** In `.env`, set `FIREBASE_PROJECT_ID=demo-firefly`,
`FIREBASE_API_KEY=fake-api-key`, `FIREBASE_STORAGE_BUCKET=demo-firefly.appspot.com`, plus:

```bash
EXPO_PUBLIC_USE_EMULATORS=1
EXPO_PUBLIC_EMULATOR_HOST=10.0.2.2   # the Android emulator's name for your computer
```

Then `npx expo run:android` (the first build takes a while) or `npm start` with an installed dev
build. On a **physical phone**, set `EXPO_PUBLIC_EMULATOR_HOST` to your computer's LAN IP and add
`"host": "0.0.0.0"` to each emulator in `firebase.json` so the phone can reach them.

> Scheduled jobs (the weekly event fallback, the daily camp-page check) do not fire by themselves in
> the emulator. Use `refreshFallbackNow` (§5.2) instead.

---

## 4. Calling the APIs by hand

Every Firefly API is a Firebase **callable function**. A callable is a plain HTTPS `POST`:

- URL: `https://europe-west1-<PROJECT>.cloudfunctions.net/<name>`, or in the emulator
  `http://127.0.0.1:5001/demo-firefly/europe-west1/<name>`
- Body: `{"data": { ...arguments... }}`
- Header: `Authorization: Bearer <Firebase ID token>`. Every function requires a signed-in user;
  an anonymous (guest) user is enough for most of them.
- Answer: `{"result": ...}` on success, or `{"error": {"status": "INVALID_ARGUMENT", "message": "..."}}`.

### 4.1 Set up your shell

```bash
# --- Emulator ---
export AUTH=http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1 KEY=fake-api-key
export FN=http://127.0.0.1:5001/demo-firefly/europe-west1
# --- or production ---
# export AUTH=https://identitytoolkit.googleapis.com/v1 KEY=<FIREBASE_API_KEY>
# export FN=https://europe-west1-<PROJECT>.cloudfunctions.net

# A guest token (anonymous sign-in). Tokens last 1 hour; run this again if you see UNAUTHENTICATED.
export TOKEN=$(curl -s "$AUTH/accounts:signUp?key=$KEY" -H 'Content-Type: application/json' \
  -d '{"returnSecureToken":true}' | jq -r .idToken)

# An admin token (needed for refreshFallbackNow). Sign in AFTER set-admin so the token carries the claim.
export ADMIN=$(curl -s "$AUTH/accounts:signInWithPassword?key=$KEY" -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"secret123","returnSecureToken":true}' | jq -r .idToken)

call()  { curl -s -X POST "$FN/$1" -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d "{\"data\":$2}"; }
acall() { curl -s -X POST "$FN/$1" -H 'Content-Type: application/json' -H "Authorization: Bearer $ADMIN" -d "{\"data\":$2}"; }
```

Numbers in the sample answers below are illustrative; real values come from the providers.

### 4.2 Places and maps (Google)

| Call | What to check |
|---|---|
| `call geocode '{"query":"Granada, Nicaragua","lang":"en"}' \| jq` | `lat ≈ 11.93`, `lon ≈ -85.96`, `country: "NI"`. With `"lang":"he"` or `"ru"` the `name` is in Hebrew or Russian. |
| `call geocode '{"query":"","lang":"en"}' \| jq` | `INVALID_ARGUMENT` (query is required) |
| `curl -s -X POST $FN/geocode -H 'Content-Type: application/json' -d '{"data":{"query":"Haifa"}}'` | `UNAUTHENTICATED`: no token, no answer |
| `call reverseGeocode '{"lat":32.794,"lon":34.989,"lang":"he"}' \| jq` | `{"name":"חיפה"}` |
| `call routeLine '{"from":{"lat":50.087,"lon":14.421},"to":{"lat":48.208,"lon":16.373}}' \| jq '.result.points \| length, .[0], .[-1]'` | About 200 `[lat, lon]` points; the first is near Prague, the last near Vienna |
| `call travelMatrix '{"mode":0,"points":[{"id":"a","lat":50.087,"lon":14.421},{"id":"b","lat":50.090,"lon":14.400},{"id":"c","lat":50.064,"lon":14.418}]}' \| jq` | `entries` such as `{"from":"a","to":"b","minutes":6,"meters":2100}`. Use `"mode":1` for public transport and add `"departure":"2026-10-17T07:00:00Z"`. Transit is often slower and some pairs may be missing; missing pairs become estimates in the app. |

### 4.3 Attractions, restaurants, hotels (Tripadvisor Terra)

Firefly uses Tripadvisor's **Terra** API (`https://terra.tripadvisor.com/api`, key in the
`X-API-Key` header). Terra only returns places on your account's **allowlist**. The first time
Firefly searches an area, it works like this:
1. It finds the best-rated places in Terra's catalog.
2. It adds them to the allowlist. This is free and immediate.
3. It asks for their full details and one photo each.

Firestore keeps only a note of which areas are done, with the place IDs (`taAreas/…`). Terra's
caching policy allows place IDs but no other content, so the content itself is never stored.

```bash
call attractionsNear '{"lat":50.087,"lon":14.421,"lang":"en","radiusKm":8,"want":10}' \
  | jq '.result.items[] | {id, name, rating, numReviews, category, suggestedMinutes, types, link, open: .openingHours, credit: .photoSources[0].credit}'
```

Check that:
- every `link` opens the place's TripAdvisor page;
- `types` matches what the place is (a castle → `History`, a zoo → `Family`/`Kid Friendly`);
- `suggestedMinutes` follows the table in §6.3 (castle 120, zoo 180, church 45…);
- each photo credit reads `Tripadvisor — <user>` and its `sourcePage` is the TripAdvisor photo page.

`"want":30` returns up to 30 places: the best-rated within 8 km (Terra's maximum radius; at most 60
results). `"lang":"ru"` returns Russian names and descriptions where Tripadvisor has them, with
English as the fallback. Content is requested as `he-IL` / `ru-RU`; reviews use `iw` / `ru`.
**Every place returned is billed** (§10), so keep `want` small when testing by hand. The
first call in a new area costs about twice as much, because of the catalog step.

```bash
call restaurantsNear '{"lat":50.087,"lon":14.421,"lang":"en","want":10}' | jq '.result.items[] | {name, cuisine, linkToPage}'
call hotelsNear '{"lat":50.087,"lon":14.421,"lang":"en","checkIn":"2026-10-16","checkOut":"2026-10-18","adults":2,"kids":2}' \
  | jq '{source: .result.source, tried: .result.tried, hotels: [.result.items[] | {name, rating, price, currency, bookingVia, linkToBooking, linkToBookingCom}]}'
call placeSearch '{"query":"Charles Bridge","lat":50.087,"lon":14.421,"lang":"en"}' | jq '.result.items[] | {id, name}'
call attractionDetails '{"id":"<an id from attractionsNear>","lang":"en"}' | jq '{name: .result.attraction.name, photos: (.result.attraction.photo_urls|length), reviews: [.result.reviews[] | {rating, title, url}]}'
```

- `hotelsNear` covers a whole stay (here 2 nights). `source` says which provider answered and
  `tried` lists what was tried in order (§2.4). For example:
  - `["agoda:no-city-id-for-cz_prague","google-hotels"]` means Agoda is configured but Prague has no
    Agoda city id yet, and Google Hotels answered.
  - `["google-hotels:skipped-monthly-budget","tripadvisor"]` means the SerpApi budget is being saved
    for the weekly job.
- With **Google Hotels** or **Agoda**, `price` is the lowest price per night for these dates and this
  party, in `currency`. `bookingVia` is `website` (the hotel's own site) or `agoda` (affiliate link).
- `linkToBookingCom` (and `linkToBooking` for TripAdvisor hotels) must be a Booking.com search with
  `checkin=2026-10-16`, `checkout=2026-10-18`, `group_adults=2`, `group_children=2` and `age=10` twice
  (children's ages aren't known when planning, so the traveller adjusts them on Booking.com). It must
  also have `no_rooms=1` (one room per 4 people), and `aid=` only if `BOOKING_AFFILIATE_ID` is set.
- Run the same call again: `cached: true` (hotel answers are kept for a day; empty answers are not
  cached).
- Every review has a `url` that opens **that review** on TripAdvisor.
- `attractionDetails` with `"id":"abc"` → `INVALID_ARGUMENT` (TripAdvisor ids are numeric).

### 4.4 Other functions

| Call | Expected |
|---|---|
| `call kidify '{"text":"Prague Castle is a castle complex in Prague, built in the 9th century. It is the official office of the President of the Czech Republic.","lang":"ru","title":"Prague Castle"}' \| jq` | With `ANTHROPIC_API_KEY`: 2–3 simple Russian sentences that use **only** facts from the text. Without the key: `{"text":null}` and the app shows the Wikipedia text instead. |
| `call reportPhoto '{"url":"https://example.org/x.jpg","sourcePage":"https://example.org","itemId":"test"}' \| jq` | `{"ok":true}`; Firestore gets `photoReports/<auto>` and `hiddenPhotos/<sha1 of url>`. Reported photos disappear from event searches immediately, including cached ones. |
| The rest (`searchEvents`, `refreshFallbackNow`, PayPal, friends…) | §5, §7 and §8 |

**Security rules spot-check (emulator).** A normal user cannot publish an event directly:

```bash
curl -s -X POST "http://127.0.0.1:8080/v1/projects/demo-firefly/databases/(default)/documents/events" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"fields":{"name":{"stringValue":"Test"}}}' | jq .error.status       # "PERMISSION_DENIED"
```

---

## 5. Events: live search, offline fallback, verification

Firefly gets events from three layers:

1. **Live search** (`searchEvents`, any place on Earth, on demand). It polls Google's event listings
   (via SerpApi, in the user's language), Ticketmaster, and events added by admins. It keeps only
   events that are **physical** (a street address that geocodes to a map pin; nothing
   online/virtual/livestream/webinar, in English, Hebrew or Russian) and **verifiable** (a link to
   the organiser or ticket page, plus a real photo with its source page). Results are cached per
   area for 6 hours.
2. **Weekly offline snapshot** (`refreshFallbackEvents`, every Monday 04:00 Israel time). It holds
   up to 150 events for the next two weekends: **50 in Israel** (16 cities) and **100 worldwide**
   (42 cities). Ticketmaster is asked for every city (it costs nothing per search). Google listings
   (SerpApi) go to the 16 Israeli cities in Hebrew first, then to a weekly rotation of the 23 world
   cities Ticketmaster barely covers. That is at most 30 searches per run (`SERPAPI_FALLBACK_MAX`),
   which fits the 250-a-month free plan (§10). The app downloads the snapshot whenever it is online.
3. **Bundled events** (20 hand-checked events in `src/data/seedEvents.ts`), always available.

With no place typed, the Weekend tab searches **100 km around the phone's location**.

### 5.1 Live search: test cases

Use dates inside the next 2 months (the window is limited to 62 days).

```bash
summary='.result | {sources, cached, center, n: (.events|length), sample: [.events[:6][] | {name, startDate, endDate, startTime, venue, origin, link, photoFrom: .photoSources[0].sourcePage}]}'

call searchEvents '{"place":"Accra","radiusKm":50,"from":"2026-10-16","to":"2026-10-25","lang":"en"}'          | jq "$summary"
call searchEvents '{"place":"Granada, Nicaragua","radiusKm":50,"from":"2026-10-16","to":"2026-11-15","lang":"en"}' | jq "$summary"
call searchEvents '{"place":"Ubud, Bali","radiusKm":40,"from":"2026-10-16","to":"2026-10-31","lang":"en"}'       | jq "$summary"
call searchEvents '{"place":"תל אביב","radiusKm":30,"from":"2026-10-16","to":"2026-10-25","lang":"he"}'          | jq "$summary"
call searchEvents '{"place":"Москва","radiusKm":30,"from":"2026-10-16","to":"2026-10-25","lang":"ru"}'           | jq "$summary"
# What the app sends when no place is typed: the phone's position, 100 km
call searchEvents '{"lat":32.08,"lon":34.78,"radiusKm":100,"from":"2026-10-16","to":"2026-10-18","lang":"en"}'  | jq "$summary"
# Filters
call searchEvents '{"place":"London","radiusKm":30,"from":"2026-10-16","to":"2026-10-25","lang":"en","types":["Kid Friendly"]}' | jq "$summary"
call searchEvents '{"place":"London","radiusKm":30,"from":"2026-10-16","to":"2026-10-25","lang":"en","query":"jazz"}'        | jq "$summary"
```

What to check:
- `sources` lists the providers that answered, e.g. `["firestore","ticketmaster","google-events"]`.
  If `google-events` is missing, the SerpApi key isn't set. If it shows
  `google-events:skipped-monthly-budget`, the month's SerpApi searches are being kept for the
  weekly job (§10). If `ticketmaster` is missing, that key isn't set. Israel, Ghana, Nicaragua and
  Indonesia rely mostly on `google-events`; Ticketmaster had only 3 events around Tel Aviv in a
  whole month (§2.5).
- Ticketmaster attraction tickets ("London Eye – Standard Experience") and add-ons
  ("… | Fast Track", "… | VIP Parking") never appear: they aren't events.
- Hebrew and Russian searches return Hebrew and Russian listings where Google has them.
- Run the same call twice: the second answer has `"cached": true` and comes back much faster.
- Errors: `"from":"2026-10-16","to":"2027-01-30"` → `INVALID_ARGUMENT` (over 62 days);
  `"place":"Xyzzyqqq"` → `NOT_FOUND`; no place and no lat/lon → `INVALID_ARGUMENT`.

**Automatic "physical and verifiable" check.** This must print `0`:

```bash
call searchEvents '{"place":"Accra","radiusKm":50,"from":"2026-10-16","to":"2026-10-25","lang":"en"}' | jq '[.result.events[]
  | select((.link|test("^https?://")|not) or .venue=="" or .address==""
      or (.location.locLat==0 and .location.locLon==0)
      or (.photo_urls|length)==0 or ((.photoSources|length) != (.photo_urls|length))
      or ([.photoSources[].sourcePage|test("^https?://")]|all|not)
      or ((.name+" "+.venue)|test("online|virtual|livestream|webinar|онлайн|וירטואלי|אונליין";"i")))] | length'
```

**Manual check of 5 random events** (do this for every new region): open `link` (does it
describe this event, at this venue, on these dates?), open `photoSources[0].sourcePage` (is the photo
published there, and is it a real photograph rather than AI art or a generic stock banner?), and
paste the address into Google Maps (is it a real place?). If a photo is wrong, report it in the app
(long-press the photo → *Report this photo*); it is hidden at once.

### 5.2 The weekly offline snapshot (150 events, 50 in Israel)

```bash
time acall refreshFallbackNow '{}' | jq      # takes a few minutes
# → {"result":{"count":…,"israel":…,"from":"2026-10-16","to":"2026-10-25","googleSearches":30}}
call refreshFallbackNow '{}' | jq .error.status   # with a guest token → "PERMISSION_DENIED"
```

- `from` is the **next** Friday and `to` the Sunday a week later (run on Friday 9 Oct 2026, that gives
  16–18 Oct and 23–25 Oct).
- `count` is at most 150 and `israel` at most 50. They can be lower if the providers have fewer
  qualifying events: an event without a real photo or a mappable address is never padded in.
- `googleSearches` is how many SerpApi searches this run spent. At most `SERPAPI_FALLBACK_MAX` (30),
  and always leaving 5 spare.
- Firestore `fallback/events` holds `{parts, count, israel, world, from, to, googleSearches,
  googleCities, generatedAt}`, and `fallback/events-0…N` hold the events in chunks of 50.
  `googleCities` shows which cities got a Google search this week; the world part rotates every week.
- Israeli events are spread round-robin over 16 cities, so they aren't all in Tel Aviv, and
  weekend events come first.

### 5.3 In the app

- **Three lists** at the top: **Near me** (live search around you), **Israel this week** and
  **Around the world** (the events collected by the weekly job, §5.2, wherever you are — the line
  under the chips says how many). The map follows the list you chose.
- **Which place:** under the search box, *"Showing events near …"* names the place being searched;
  *Change place* jumps to the search box.
- **On the emulator** "near me" is **Mountain View, California** — Android emulators put you there
  unless told otherwise, and the app says so. To test from Israel: emulator ⋯ → *Location* → search
  Tel Aviv → *Set location*, then tap the location button next to the search box.
- **Countryside and family events:** the live search asks Google for *events* and for *family
  workshops, guided tours and outdoor activities*; the weekly job adds nationwide searches for the
  Israel Nature and Parks Authority, family nature outings, the National Trust and English
  Heritage (`THEMED_SEARCHES`, `functions/src/events/plan.ts`). None of these organisations offers an
  events feed, but their published events appear in Google's event listings.
- **Offline:** open the Weekend tab once online (this downloads the snapshot), then switch on
  airplane mode and reopen it. You see the banner *"Offline — showing saved data."* and events from the
  snapshot, the bundled list and your last search, within 100 km of you (or nearest first if none
  are that close).
- **Map:** every event has a pin. Tap a pin to see a short description, then *Official page* and
  *Where to book*.
- **Search this area:** pan the map to another country and tap it; a live search runs there.
- **Add an event (admin only):** try to publish an online event, or a photo without its source page.
  The form refuses with a clear message. The same rules are enforced again by Firestore and the
  server, so a modified app can't bypass them.

---

## 6. How Firefly builds a trip

This section explains the planner in plain language, with the exact numbers the code uses (from
`src/planner/route.ts`, `generator.ts`, `scheduler.ts` and `classify.ts`). After reading it you should
be able to look at any plan and say why each day is where it is, why each item is there, and why
something else isn't. `npm run explain` prints all of it for a real trip (§6.7).

### 6.1 The big picture

```
 Your choices ─┐
               ▼
 1. Check the request (1–30 days)  ── 2. Find the start and end cities
               │
               ▼
 3. Walk the route day by day (greedy):
      • today's place: stay, or move to the next big city / a landmark on the way
      • pick today's attractions in priority order (popularity → accessibility → type/age → distance)
               │
               ▼
 4. Collect for every place: events · restaurants · one hotel per stay
               │
               ▼
 5. Each day's timetable with real travel times (opening hours, meals, fixed-time events)
               │
               ▼
 6. Family trip? The kids' plan: simple descriptions + a sourced fun fact per place
```

It is a **greedy** planner: it always takes the best thing that fits *right now*. That makes it fast
and every choice easy to explain, but it does not try every possible order. That is why travellers
can drag and drop, and why the app checks their changes (§6.8).

### 6.2 Where each day is (the route)

- **Checks:** at least 1 adult; the end date is on or after the start date; at most **30 days**.
- **Cities** are found with Google Geocoding. An empty "Ending city" means "same as the starting city".
  Start and end **under 30 km apart** = a round trip (you come back to the start on the last day);
  otherwise one-way (the last day is in the end city).
- **Day 1** is in the starting city. Each following morning the planner decides: **stay, or move on**.
- **Move on** when the place has **run out of attractions rated 9.0 or more AND of attractions rated
  7.0 or more that fit your niches** (one of your chosen types; Family / Kid Friendly on a family trip;
  confirmed for one of your accessibility needs. When you chose none of these, every place fits).
  Ratings are the 0–10 popularity of §6.3.
- **Never more than 4 days** in one city, except world cities (London, Paris, New York, Rome,
  Istanbul, Tokyo — list in `WORLD_CITIES`, `src/planner/route.ts`). On a round trip the last day is
  always back home, even if that makes it a fifth day there.
- **On schedule:** the trip also moves on when it must, to reach the destination by the last day
  (at most **450 km a day by car, 400 km by public transport**).
- **The next stop** is the next **big city**: one of the 2,575 cities with 150,000+ people or capitals
  (GeoNames, bundled in `src/data/bigCities.ts`) plus 48 famous tourist towns (Venice, Bruges,
  Dubrovnik, Český Krumlov, Kotor…). It must be **within a day's travel** (60–450 km), keep the
  destination reachable in the days left, and on a one-way trip **get closer** to the destination
  **without a big detour** (hop + rest of the way ≤ 1.3 × the direct distance + 30 km) and never
  overshoot it. Among those, **bigger cities first** (1M+, 500k+, 250k+ or tourist town, others),
  then the **nearest** (priority 4: distance from the last place).
  Example (tested): **Prague → Vienna → Budapest → Belgrade → Sofia → Plovdiv → Thessaloníki → Athens**.
- **Landmarks on the way:** when a move is 100 km or more, the planner looks at the half-way point for
  a **world-class nature or heritage site** (national park, waterfall, lake, cave, castle, ruins…,
  popularity 9.0+) that is on the way and brings you closer to the destination. If there is one, it
  gets **a day of its own** ("Day 4 – Plitvice Lakes National Park"), with a hotel nearby.
- The day's title on the plan is **"Day x – Place"**, in dark green.

### 6.3 Where the attractions come from, and popularity (0–10)

Two sources, merged into one list and treated exactly the same way:

1. **Tripadvisor** (main source): the best places within 8 km (its maximum radius).
2. **Wikidata** (free backup — no key, no approval, public domain): places of 47 kinds (castles,
   palaces, ruins, museums, churches, national parks, lakes, waterfalls, caves, zoos, theme parks,
   theatres, markets…) within 12 km of a city or 20 km of a landmark, each with its **Wikipedia
   article** (the "source" link) and a **Wikimedia Commons photo** with author and licence. Live
   answers are cached 30 days. On top of that, a Europe-wide **backup list of 5,000 attractions**
   (the best-known in every European country and Israel, a quarter of them nature, spread so that
   no single city takes all the room) is built once a month — and on demand with
   `npm run attractions:build` (§2.3).

The same place from both sources is merged (closer than ~80 m, or close with a similar name): the
Tripadvisor record is kept, with Wikidata's photo if Tripadvisor had none. **Bike rentals, bars,
shops and spas are never planned**; cafés, food tours and tastings only when you chose *Food*.

**Popularity (0–10)** — the "rating" in every rule above:
- Tripadvisor: the rating × 2, pulled towards 7.0 when there are few reviews
  (`(reviews × rating × 2 + 50 × 7) / (reviews + 50)`). The Colosseum (4.7★, 400,000 reviews) = 9.4;
  a café with ten 5★ reviews = 7.5, so a handful of glowing reviews never beats a landmark.
- Wikidata: from how many Wikipedia language editions cover the place:
  `5 + 2.2 × log10(editions + 1)`. ~65 editions (Plitvice, Charles Bridge) ≈ 9.0; ~7 editions ≈ 7.0.
- When both sources know the place, the higher of the two.

**Tripadvisor's rate limit.** Tripadvisor allows a number of requests per second and per day that
depends on your Terra plan (dashboard → *Manage Plan*). The server spaces its requests to
`TRIPADVISOR_QPS` (in `functions/.env`, default 3) and, after a *429 Too Many Requests*, pauses
Tripadvisor for 90 seconds and uses Wikidata (attractions) and OpenStreetMap (restaurants) in the
meantime. The plan then says so at the top ("Tripadvisor was busy…").

**Filters:**
- On a **family trip** (kids > 0) or with **"Kid-friendly places only"**, adults-only places are
  never suggested (bars, nightlife, casinos, breweries, anything erotic).
- With **"Kid-friendly places only"**, only places typed *Kid Friendly*, *Family* or *Nature* remain.

Visit lengths: Tripadvisor's recommended length when it has one; otherwise by kind or category
(theme park 240 min, national park 240, zoo 180, museum / castle 120, park / garden 75, church 40–45,
bridge / square / viewpoint 30–40, anything else 60–90).

**Events.** Only when "Add local events & festivals" is on: the live event search (§5) around each
place, **within 40 km**, for the trip dates. On family or kid-friendly trips, only events typed
*Kid Friendly* or *Family*.

**Restaurants.** Tripadvisor within 5 km (never its lighter "catalog" listings, which can't tell a
restaurant from a bike rental); when Tripadvisor is busy or finds too few, **OpenStreetMap** cafés and
restaurants within 3 km (free, no key; each links to its own website or its map page).

**Hotels.** A hotel for **every night except the last** (the last night is at home). Consecutive
nights in the same place form one **stay**, with **one** hotel search covering all its nights. Sources
in order (§2.4): Agoda (prices) → Google Hotels (prices compared) → Tripadvisor (no prices). The
**highest-rated** wins; within 0.1★ the **cheaper per night**.

**Must-see places** you added go to the day spent **closest** to them, and are always tried first.

### 6.4 Choosing the attractions of a day (the greedy order)

Each day, the unused attractions of today's place are put in this order, **exactly**:

1. **Popularity** (§6.3), in half-point steps (9.4 and 9.2 are both "9.0+", so the next rules can
   decide between places of the same standing);
2. **Accessibility:** how many of your chosen accessibility needs the place is *confirmed* for
   (only when you chose needs);
3. **Type and age:** how many of your chosen types it matches (up to 2), +1 for Family / Kid
   Friendly places on a family trip;
4. **Distance from the previous point** (the last place visited, or last night's hotel): the
   nearest first.

The **14** first places are offered to the day builder (§6.5), plus must-sees. The builder takes them
in that order as long as they fit (opening hours, meals, fixed-time events, the end of the day, at
most 6 places — fewer with accessibility pacing). A place that would mean waiting more than 75 minutes
for it to open is taken only when nothing else fits.

**Events** that can be visited any time during their opening hours ("drop-in") rank like a **9.0**
attraction (+ type matches): real local events are what Firefly is about. How an event's time is read:

| The event publishes | Treated as |
|---|---|
| start and end, 4 hours or less apart (a show, a parade) | **fixed** at that time; the day is built around it |
| start and end, more than 4 hours apart (a festival day, a market) | **drop-in**: a 2-hour visit anywhere inside those hours |
| only a start time | **fixed**: 2 hours from the start |
| no times | **drop-in**: a 90-minute visit any time in your day |

### 6.5 Building one day, hour by hour

The day starts at your chosen start time (default 08:00), at your starting city on day 1 and at last
night's hotel on later days. Then this loop repeats:

1. **Is it mealtime?** When the clock reaches 15 minutes before a meal window, the planner books
   the **closest restaurant** that is open, not yet used on this trip, can seat you in the window,
   lets you finish before your day ends, and still lets you reach the next fixed-time event.

   | Meal | Starts between | Length | Planned only if your day covers it |
   |---|---|---|---|
   | Lunch | 12:00 and 14:30 | 60 min | day starts by 13:30 and ends after 13:00 |
   | Dinner | 18:30 and 21:00 | 75 min | day starts by 19:45 and ends after 19:45 |

2. **Otherwise, pick the best next visit.** For each offered attraction or drop-in event that is
   left, the planner works out the travel time from where you are and the earliest start (waiting
   for it to open if needed). It throws out anything that:
   - would be **closed** for any part of the visit. If a place publishes no hours, it is assumed open
     and the card says "Opening hours not published";
   - would **end after your day ends**;
   - would make you **late for a fixed-time event** (counting the travel to it);
   - would leave **no room for the next meal**. Before lunch, a visit must end by 13:30; before
     dinner, by 19:45. In both cases it must also end early enough to travel to the closest
     restaurant and finish eating before your day ends. *Exception:* a visit of **3 hours or more**
     that is under way at mealtime (a zoo, a theme park) may run through it, and the meal is **eaten
     on site**. The card shows "Lunch on site".

   Among what is left, it takes the **first in the greedy order of §6.4**: must-see places first,
   then places you can start without waiting more than 75 minutes for them to open, then by
   popularity → accessibility → type/age, and between equals the **nearest to where you are now**.

3. **If nothing fits right now,** the planner goes to the next fixed-time event, or gives you free time
   until the next meal (you leave in time to be at the restaurant when the window opens). If neither
   is left, the day ends.

At most **6 attractions per day**. Drop-in events don't count towards the limit.

### 6.6 Travel times

For each day, Firefly asks the Google Routes API for travel times between **all** of that day's
points: the base, the offered places, events, restaurants and tonight's hotel (up to 25 points).
**Car** uses driving times; **public transport** uses transit times for that date and start hour.
If Google has no answer for a pair (no transit connection, quota, offline), the app uses a
conservative estimate and shows **"(estimate)"**:

- **car:** road distance ≈ 1.35 × straight line; 25 km/h under 10 km, 50 km/h up to 50 km, 85 km/h
  beyond; plus 5 min to park;
- **public transport:** walk if under 1.2 km (4.5 km/h); otherwise 10 min waiting plus 18 km/h in
  town or 55 km/h between towns.

These times are saved with the day, so drag and drop can re-time the day instantly, even offline.

### 6.7 Worked example (`npm run explain`)

A family of 2 adults and 2 kids in Testville, Fri 16 – Sun 18 Oct 2026, types *History* + *Kid
Friendly*, car, 09:00–20:00, events on. This is an excerpt of Saturday:

```
══ Day 2 · Sat, 17 Oct 2026 · based around Testville ══
Starts from: Hotel Riverside (last night's hotel)
   score =  quality + popular. + types + family   place [visit, hours today]
    95.6 =  42.0 +  31.6 +    12 +     10   Fun Valley Theme Park [240 min, 10:00–18:00]
    95.3 =  47.0 +  36.3 +    12 +      0   Hill Castle [120 min, 09:00–17:00]
    87.2 =  45.0 +  30.2 +    12 +      0   Old Synagogue Museum [120 min, closed today]
    ...
Events today:
   ★ Puppet Theatre matinée — fixed time 15:00–16:00: the day is built around it
   ★ Autumn Food Festival — drop-in 11:00–22:00, score 75 (75 + 12 per matching type)
Decisions:
   09:00  → Hill Castle 09:09–11:09  (travel 9 min; value 81.8)
            also fitted: Botanic Garden 61.2, Blue Lake Beach 28.9, Fun Valley Theme Park 5.6
            didn't fit: Old Synagogue Museum (closed all day today); Lantern Walk (would end after your day ends)
   11:09  → City History Museum 11:23–13:23  (travel 14 min; value 61.9)
            also fitted: Autumn Food Festival 60.0, Botanic Garden 58.2, Blue Lake Beach 33.4
            didn't fit: Fun Valley Theme Park (would make you late for a fixed-time event); ...
   13:23  🍴 lunch at Garden Kitchen 13:34 (travel 11 min) — the closest open restaurant
   14:34  ★ Puppet Theatre matinée 15:00–16:00 (fixed time; travel 9 min)
   16:00  → Autumn Food Festival 16:08–18:08  (travel 8 min; value 63.0)
   18:08  … nothing fits before dinner: free time until 18:30
   18:08  🍴 dinner at Evening Grill (dinner only) 18:30 (travel 8 min) — the closest open restaurant
   19:45  day ends: nothing else fits before the end of your day
```

How to read it:
- **Hill Castle first.** Its value is 95.3 − 1.5 × 9 = **81.8**. The theme park scores slightly
  higher (95.6), but it is 7 km out (29 min) and opens at 10:00 (31 min wait), so its value is
  95.6 − 1.5 × (29 + 31) = **5.6**.
- **The Old Synagogue Museum** is closed on Saturdays, so it is never considered today. It is visited on
  Sunday instead.
- **The puppet show** has a fixed time (15:00–16:00, one hour), so the morning is planned around it.
  The theme park would make you late for it and is skipped.
- **The food festival** is open 11:00–22:00 (over 4 hours), so it's a drop-in worth 75. It came
  second at 11:09 (60.0 vs 61.9) and is visited after the puppet show, when it is the best that fits.
- **Lunch** at 13:34 is the closest restaurant open at that moment, and **dinner** at 18:30 is the
  closest one open in the evening. Neither is used again unless the town's list runs out.
- **The Lantern Walk** (19:30–22:00, 90 min) never fits a day that ends at 20:00. Run
  `npm run explain -- --kids 0 --day-end 23:00` and it can appear.
- **The theme park** never wins on this trip: it is far, long, and the best-rated things nearby keep
  beating it. Make it a must-see (`--must-see "Fun Valley"`) and it is placed first on Friday,
  10:00–14:00, with "lunch is eaten on site".

The full output also shows what was offered each day, which restaurants were offered, and whether
travel times came from Google or were estimated.

**Running the explainer on real data.** With deployed functions (or the emulators), this prints the
same explanation for any real city:

```bash
FIREBASE_API_KEY=<web api key> FIREBASE_PROJECT_ID=<project> \
  npm run explain -- --live --from "Prague" --start 2026-10-16 --days 3 --kids 2 --types "History,Kid Friendly"
FIREBASE_API_KEY=... FIREBASE_PROJECT_ID=... npm run explain -- --live --from "Prague" --to "Vienna" --days 4 --kids 0
USE_EMULATORS=1 npm run explain -- --live --from "Tel Aviv" --days 2 --lang he
```

### 6.8 After the plan: drag and drop, remove, move

All edits re-time the day with the saved travel times. If a change doesn't work, the item snaps back
and the reason is shown:

| You try to… | Result |
|---|---|
| drag a museum to after its closing time | refused: *"…it's closed at that time"* |
| "Move to another day" onto a weekday the place is closed | refused: *"…it's closed that day"* |
| make the day run past your end time | refused: *"…the day would end after 20:00"* |
| push a visit into a fixed-time event | refused: *"…it would clash with Puppet Theatre matinée, which has a fixed time"* |
| drag a fixed-time event | not draggable: events with set times can't move |
| remove an item | the rest of the day moves earlier where it can, never later |
| "Move to another day" | inserted where it adds the **least travel** on that day, or refused with the reason if no position works |

### 6.9 The kids' plan (family trips only)

When kids > 0, the plan has a pink **Kids' plan** tab. For each place:
- **Kid description:** Firefly finds the Wikipedia article about that place (an article within 1 km
  whose title matches the name). It uses Simple English Wikipedia in English, or Hebrew or Russian
  Wikipedia in those languages, and links to it. If an Anthropic key is set, the text is reworded for
  7–10-year-olds using **only** facts in that text.
- **Fun fact:** one sentence quoted from that article (not from any website about the trip). It
  prefers sentences with a number or a superlative ("oldest", "largest", "built in…") and is linked to
  its source with *Read more on Wikipedia*. If no article is found, no fun fact is shown; none are
  invented.

### 6.10 "Why did it…?" — quick answers for testers

| Question | Usual answer |
|---|---|
| Why is a famous place missing? | It's more than 12 km from that day's place, neither Tripadvisor nor Wikidata returned it, 14 places ranked higher that day, it was used on another day, it didn't fit (closed, too long, clashed), it's adults-only on a family trip, or the day already had 6 attractions. `npm run explain -- --live …` shows which. |
| Why did the trip leave a city after one day? | No place rated 9.0+ was left, and no 7.0+ place that fits your chosen types / ages / needs (§6.2). Choosing types keeps you longer in cities rich in them. |
| Why only 4 days in a city? | The 4-day limit (§6.2); world cities like Paris or London are exempt. |
| Why a day at a national park between two cities? | A world-class landmark (9.0+) on the way gets its own day (§6.2). |
| Why does a place link to Wikipedia instead of Tripadvisor? | It came from Wikidata, the free backup source (§6.3). Its photo credit names the author and licence. |
| Why a long gap in the afternoon? | Nothing left fits before dinner: places close, are too long, or were already visited. The gap is free time. |
| Why this restaurant? | It was the closest open restaurant at that moment. Restaurants repeat only when a town's list runs out. |
| Why no dinner? | Your day ends before 19:45, or no offered restaurant was open and reachable in time. |
| Why "(estimate)" next to a travel time? | Google had no route for that pair (common for public transport); the conservative estimate in 6.6 was used. |
| Why does day 3 of my one-way trip start in a town I didn't choose? | The trip moves from big city to big city towards the destination (6.2). |
| Why no hotel on the last day? | The last night is at home. |
| Why did it go somewhere that opens later and wait? | It ranked first and the wait was under 75 minutes; longer waits are taken only when nothing else fits. |
| Why the same hotel two nights running? | Consecutive nights in the same place are one stay, booked as one. |
| Why this hotel and not a cheaper one? | Rating decides first; price only breaks near-ties (within 0.1★). |
| Why no price on the hotel? | It came from TripAdvisor: Agoda isn't set up for that town yet and Google Hotels was skipped to save the month's SerpApi searches. |

### 6.11 Planner test scenarios (with real data)

| # | Set up | Expected |
|---|---|---|
| 1 | Prague, 3 days, 2+2, History + Kid Friendly, car, 08:00–20:00 | No bars; Kids' plan tab; lunch 12:00–14:30 and dinner 18:30–21:00 every day; no attraction repeats; hotel on nights 1–2 only; every visit within the place's published hours |
| 2 | Same, "Kid-friendly places only" | Only Kid Friendly / Family / Nature places |
| 3 | Prague → Vienna, 4 days, adults | Day bases Prague, ~⅓, ~⅔, Vienna; different hotels; last day has no hotel |
| 4 | Prague, 7 days | Every day has attractions (the wider search is used); restaurants may repeat late in the week |
| 5 | Same as 1, public transport | "by public transport" travel rows; times differ from car; some "(estimate)" |
| 6 | Tel Aviv, a weekend with a known fixed-time event, events on | The event is at its exact time; the day is built around it |
| 7 | Slider 07:00–01:00, adults | Evening items such as night tours can appear; nothing before 07:00 or after 01:00 |
| 8 | Add a must-see place far from the centre | It appears on the day whose base is closest |
| 9 | Hebrew, then Russian | Place names, descriptions and fun facts in that language where the sources have them |
| 10 | Drag and drop as in 6.8 | Each refusal shows the matching message |

---

## 7. Camps, booking and payment

### 7.1 Camps tab (orange)
- 16 camps from differentroute.net with real photos (credit chip → the differentroute.net page).
- Search box, then **Filters**, which folds out into panels: When, Who's going (age), Budget, Where,
  **Accessibility** and (once there is more than one) **Organiser**. A closed panel shows what's chosen.
- Camp cards fold out (tap the card): description, length, organiser, accessibility support, and
  *View page* / *Book*. Opening and closing animate gently; with Android's *Remove animations*
  setting on, they open instantly.
- **Accessibility:** every camp has `disability: string[]` (autism, adhd, hearing, blind,
  mentalHealth, physical, intellectual), empty for now. Choosing a need shows only camps that
  support every need chosen; with today's data that is none, so the list says more camps with
  disability support are coming. To mark a camp, add the values to `camps/<id>.disability` in
  Firestore (or to `src/data/camps.ts` and `npm run seed`).
- **Organiser:** every camp has `provider` (default `"Differentroute"`). Camps by another organiser
  show *View page* only, with "booking … coming soon"; the booking screen and the server
  (`createPaypalOrder`, `createGrowPayment`) refuse them too.
- *Camp page*: photos, price and what it includes, and the day-by-day itinerary (rephrased from
  differentroute.net). Armenia and Netherlands show "itinerary not published yet" because the website has
  no page for them.
- Favourite a camp; it appears under *Favourite camps* on the user page.

### 7.2 Registration form
The form has exactly the fields of the Different Route JotForm (camper, address, other campers,
passport upload, parent, emergency contact and relationship, medical, inhaler, additional info,
*Which camp* with the same 17 options, terms, date, finger signature). Check:
- empty required fields, a bad e-mail and a bad phone are highlighted;
- the passport upload accepts a photo or PDF;
- the terms text matches the JotForm terms.

### 7.3 Card payment (Grow)
Card payments use **Grow** (formerly Meshulam): the parent types the card on Grow's own secure page,
so card numbers never reach the app or our server. Grow charges in **shekels**.

Set-up (once):
1. Ask Grow for API access for the business account (sandbox first). They provide a **userId** and a
   **pageCode** (and an **apiKey** only for platform set-ups).
2. Put them in `functions/.secret.local` (`GROW_USER_ID`, `GROW_PAGE_CODE`, `GROW_API_KEY`), run
   `npm run push-secrets`, and deploy the functions.
3. In `functions/.env`: `GROW_ENV=sandbox` (later `production`), and `GROW_EUR_ILS` — the euro → shekel
   rate for camps without their own shekel price. To fix a camp's shekel price instead, add
   `priceILS` to `camps/<id>` in Firestore.

How it works: the Payment section has three equal buttons — *Pay with PayPal*, *Pay by card (Grow)*
and *Bank transfer* — and none is pre-selected; tapping one sends the booking. *Pay by card (Grow)* → the server reads the price from `camps/<id>`, creates a
Grow payment page (`createPaymentProcess`) and keeps its id and token in `payments/<bookingId>`
(server-only). Grow tells the server the result directly (`growNotify`); the server checks it with
`getPaymentProcessInfo`, compares the amount, marks the booking paid and acknowledges with
`approveTransaction`. The app waits for that and then asks for the health form.

Test (sandbox):
1. Book with a parent phone that is an Israeli mobile (05…) — Grow requires one. Tap *Pay by card
   (Grow)* and pay with Grow's sandbox test card.
2. Expected: *"You're booked in!"* with the health-form question; `campBookings/<id>.status = "paid"`
   with `growTransactionId` and `amountIls`; an e-mail `[PAID · Card] …`.
3. Close Grow's page → *"Payment was cancelled."*; nothing e-mailed.
4. Without Grow credentials the app says card payment isn't switched on yet; PayPal and bank
   transfer still work.

### 7.4 Health form
The health form is Different Route's paper form *GUEST MEDICAL INFORMATION* with exactly its fields:
guest name, booking ref, date of birth, gender, arrival, departure; doctor name, address and
telephone; the six questions (regular treatment + details, medication + the Medication
Administration Form note, tetanus + dates, allergies + details, bed-wetting); the 14 consent boxes;
the consent paragraph and tick; print name, relationship to child, signature and date.
- It is **not** needed to book or pay. After a booking, the app asks *"Fill in the health form now"*
  (or *Later*). It is also under Profile → *Booked camps* → **Fill up health forms**, one per child.
- Names, birth date, gender and camp dates are filled in from the booking.
- *Save the form* checks it (missing answers are marked and their panels open); *Save for later*
  keeps a draft.
- **Save as PDF** makes an A4 PDF right away and opens the share sheet (save to the phone or Drive,
  or send it). **Print** opens Android's print dialog. The PDF uses the paper form's English labels,
  with the Hebrew or Russian translation under each when the app is in that language, and ends with
  the reminder to print it and bring it to camp.
- Stored in `healthForms/<bookingId>`: readable only by the parent who booked and by admins; never
  e-mailed.

### 7.5 PayPal (sandbox)
1. Tap *Pay with PayPal*. The PayPal sandbox page opens in the app.
2. Log in with the **sandbox buyer** account and pay.
3. Expected: *"Payment received — your place is booked!"*; Firestore `campBookings/<id>.status = "paid"`
   with `paypalCaptureId`; an e-mail to `BOOKINGS_EMAIL` with subject `[PAID · PayPal] <camp option> — <camper name>`;
   the camp under *Booked camps*; friends get an in-app notification.
4. Cancel on PayPal → *"Payment was cancelled. Nothing was charged."* and nothing is e-mailed.
5. **Tamper test:** in the Emulator UI, change `campBookings/<id>.price` to `1` before paying. PayPal
   still charges the **catalogue price** from `camps/<campId>` (the server overwrites the price).
6. Calling `capturePaypalOrder` with someone else's booking, or with an order id that doesn't match
   the booking → `NOT_FOUND` or `PERMISSION_DENIED`.

### 7.6 Bank transfer
Tap *Bank transfer*. Expected:
- *"Registration sent!"*;
- an e-mail to `BOOKINGS_EMAIL` (default dubinanna@gmail.com) with subject `[Bank transfer] …`;
- the e-mail lists every form field, has a passport link valid for 30 days, and attaches `signature.svg`;
- *Reply* goes to the parent's e-mail;
- `campBookings/<id>.emailedAt` is set.

---

## 8. Friends, chat and notifications

Use two accounts (two emulators/phones, or sign out and in). Tokens for `curl` come from
`accounts:signInWithPassword` as in §4.1.

| Step | Expected |
|---|---|
| A: *Find people* → search B's name or username → *Add friend* (`sendFriendRequest {"toUid":"<B>"}`) | B gets a *friend request* notification in the app (never by e-mail) |
| B accepts (`respondFriendRequest {"fromUid":"<A>","accept":true}`) | Both `users/*.friends` arrays updated; A gets *accepted* |
| A opens a chat with B | Messages appear live on both phones. A chat with a non-friend is refused by the security rules |
| A taps *I'm going* on an event (`setGoing`) | Event under A's *Events I'm going to*; B notified; the event is copied to `savedEvents` so it never vanishes from A's profile |
| `saveEvent` with an event whose venue is "Online" | `INVALID_ARGUMENT` |
| A saves a trip | B notified "is planning a trip" |
| A → *Add friends to this trip* → B (`addTripPeople`) | Trip appears in B's *My trips*; B notified. Non-friends are ignored. A user who isn't on the trip → `PERMISSION_DENIED` |
| A books a camp | B notified |

Notifications are shown in each reader's own language: a Hebrew reader sees Hebrew text even if the
sender uses Russian.

---

## 9. On-device checklist

**Log-in and start screen**
- [ ] A fresh install opens on the log-in page (dusk scene, language buttons at the top). The
      language buttons switch the whole page; עברית restarts the app right-to-left.
- [ ] Wrong password → "Wrong e-mail or password." under the form. *Forgot password?* with an e-mail
      typed → a reset e-mail arrives (Firebase's template; edit it under Authentication → Templates).
- [ ] *Create an account* → the register page; a taken username, a short password and mismatched
      passwords each show their own message under the field.
- [ ] After logging in or registering, the start screen shows four separate tiles: Camps (orange),
      Events (purple), Trips (green) and My profile. Each opens its tab; the Home tab returns.
- [ ] Close and reopen the app: an account holder goes straight to the start screen.
- [ ] *Continue as guest* → the start screen says "browsing as a guest"; My profile opens the log-in
      page, and after logging in you return to where you were. A guest sees the log-in page again
      the next time the app starts.
- [ ] Profile → *Log out* → back to the log-in page.
- [ ] Every screen opened from a list has a back arrow (it points right in Hebrew).

**Languages and RTL**
- [ ] User page → Language → עברית: the app restarts right-to-left (tabs, rows, arrows, the time
      slider). Back to English → left-to-right.
- [ ] Every screen in Hebrew and Russian has no English left over, except proper names and the camp
      terms (the legal text is Different Route's own).
- [ ] Russian plurals: 1 день, 2 дня, 5 дней. Hebrew dates and prices are formatted correctly.

**Weekend (purple)** — see §5.3. Also: filters by name, date, price, type, country and price range;
favourite an event; *I'm going*.

**Calm design**
- [ ] No grey anywhere: secondary text is dark orange in Camps, plum in Events, dark green in Trips;
      trip-type tiles each have their own colour (green Nature, terracotta History, raspberry Theatre…)
- [ ] A plan opens with **Your route**: a map of every stop joined by a line, and the stops with their
      days and a real photo of each place's best-known sight (Prague → Prague Castle or Charles
      Bridge, Budapest → the Parliament) with its credit; tapping a stop opens its first day, tapping
      the credit opens the photo's source page
- [ ] Each day is titled **"Day x – Place"** in dark green, with its own map; attractions are dark
      green with an emoji for their kind (🌳 national park, 🏰 castle / ruins, 🏛️ museum…)
- [ ] Day chips in the header are readable (selected = white with green text)
- [ ] Prague → Athens over 10 days: several big cities in order, never more than 4 days in one, the
      last day in Athens; places from Wikidata open on Wikipedia
- [ ] Events: *Near me / Israel this week / Around the world*; the line under the search box names
      the place being searched
- [ ] Text is Inter in English and Rubik in Hebrew and Russian (switch language in Profile: the font
      changes at once); buttons, chips and icons are easy to hit
      (at least 48 × 48).
- [ ] Every fold-out panel opens and closes smoothly; a press makes the item settle in slightly.
      With Settings → Accessibility → *Remove animations* on, panels open instantly.
- [ ] Events: search and filters come first, the map below them; event cards fold out.

**Trip planner — accessibility**
- [ ] With no need chosen, the trip is exactly as before (no accessibility checks, usual pace).
- [ ] Choose *Blind or low vision* with *Only places confirmed* on: only places whose own site (or
      an organisation record) mentions provisions for blind visitors are used; each shows
      "Confirmed: Blind or low vision". Choose *Autism* instead: a different set (sensory-friendly
      evidence), never the blind-only places.
- [ ] *Only places confirmed* off: confirmed places come first; others say "Not confirmed … check with
      the venue".
- [ ] Any need slows the day: up to 3–5 places and a 10–30 minute break after each (shown above the
      day). Drag and drop keeps the breaks.
- [ ] An attraction page shows an *Accessibility* panel listing, per need, the page that confirms it.

**Trip planner**
- [ ] Trip-type tiles show real photos (Wikimedia Commons, credit shown): forest for Nature, a castle
      for History, and so on.
- [ ] The time slider goes from 07:00 to 01:00 in 30-minute steps, with at least 3 hours between
      the handles; the default is 08:00–20:00.
- [ ] While building, the progress steps show (finding cities → attractions → events → restaurants and
      hotels → travel times → kids' version).
- [ ] Icons: party hat for events, fork and knife for restaurants; restaurants and hotels open their
      TripAdvisor or Booking.com pages (no in-app page); attractions open the in-app page with photos
      and reviews, and each review links to TripAdvisor.
- [ ] Drag and drop, remove, move to another day and favourite all behave as in 6.8.
- [ ] Kids' plan (family trips only): pink, simple texts, a fun fact per place with *Read more on
      Wikipedia*.
- [ ] Save the trip, close the app, reopen it: the trip is under *My trips*.

**Offline:** with airplane mode on, an open trip keeps working. Drag and drop re-times it instantly,
because travel times are stored with the plan. Weekend shows saved events. Building a new trip, and
loading *My trips* after the app restarts, need the internet.

**Photos:** tap the credit chip on any photo to open the page it comes from. Long-press a photo →
*Where is this photo from?* → *Source*, or *Report this photo*, which hides it at once.

---

## 10. Costs, quotas and troubleshooting

### Where API usage comes from
- **Google Routes (matrix):** each planned day asks for travel times between up to 25 points, which
  is up to 625 pairs. Pairs are billed per element, so a 7-day trip can use a few thousand. Identical
  requests are cached for 7 days. To cut usage, lower `CANDIDATES_PER_DAY` or `MEAL_OPTIONS_PER_DAY`
  in `generator.ts`.
- **Tripadvisor (Terra, Discover plan).** Billed **per place returned**:
  - the first **1,000 are free once per account**, not every month;
  - after that, $0.015 per place, falling to $0.009 at volume.

  Photos and reviews count once per place per call; allowlist changes are free; errors aren't
  billed. Terra doesn't allow caching its content, so every trip fetches fresh data. Rough usage:
  - a 3-day trip in a **new** town: about 70–80 places (attractions and restaurants twice, because
    of the catalog step);
  - the next trip to the **same** town: about 35–40;
  - each attraction page: 3 (details, photos, reviews).

  So roughly $0.50–1.20 per planned trip once the free 1,000 are used. Set a daily budget in the
  Terra dashboard (*Manage plan*). To spend less, lower `ATTRACTIONS_PER_DAY` /
  `RESTAURANTS_PER_DAY` in `generator.ts`.
- **SerpApi (Free plan: 250 searches a month, renewing on the 9th).** Searches are spent on:
  - each live event search: 2 per area, dates and language, cached 6 hours;
  - each hotel stay priced through Google Hotels: 1, cached 1 day;
  - the weekly snapshot: at most 30 per run.

  The server checks SerpApi's (free) account endpoint before spending. Live and hotel searches stop
  while the searches left are fewer than the weekly runs still need before renewal (30 × Mondays
  left, never under 10). The weekly job therefore always has enough, and live searches fall back to
  Ticketmaster + admin events. Hotels fall back to Agoda/TripAdvisor. With real users, a paid
  SerpApi plan is the single most useful upgrade; raise `SERPAPI_FALLBACK_MAX` after upgrading.
- **Ticketmaster:** 1 call per live search and per city in the weekly run; no per-search cost, within
  Ticketmaster's daily quota.
- **Anthropic:** one short request per place in a kids' plan, cached 30 days (failures are not cached).
- **Wikipedia:** free, called from the phone and cached (type photos are kept on the phone).
- **Warm-up pings:** when the app opens, and when the Trip tab is shown (at most every 10 minutes),
  it sends `{ warmup: true }` to the nine trip and event functions, which answer at once without
  calling any outside service. This hides the few seconds each function needs to start after a
  quiet spell. That's a handful of tiny requests per visit, normally within the Cloud Functions free tier.

Check current prices and quotas on each provider's site; they change.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `UNAUTHENTICATED` | Token missing or older than 1 hour: run the `TOKEN=` line again |
| `PERMISSION_DENIED` from `refreshFallbackNow` | Run `set-admin`, then sign in again to get a token with the claim |
| `INTERNAL` from a function | Look at the emulator terminal or `firebase functions:log`; usually a missing secret |
| A trip has only events and lunches, no attractions; `functions:log` shows `429 … Rate Limit was exceeded` | Tripadvisor's per-second or daily limit was reached. The server now spaces requests (`TRIPADVISOR_QPS` in `functions/.env` — set it to your Terra plan's QPS) and falls back to Wikidata and OpenStreetMap; run `npm run attractions:build` once so the backup list is complete. Check the daily limit in the Terra dashboard → *Manage Plan*. |
| Events "near me" are in California | That's the emulator's default location (§5.3). Set the emulator's location, or pick *Israel this week*. |
| Tripadvisor 401 | Wrong or regenerated key: copy it again from the Terra dashboard (Overview → My API key) into `functions/.secret.local`, then `npm run push-secrets` |
| Tripadvisor 403 "API Key does not have access to endpoint" | Your Terra package doesn't include that endpoint (Manage plan). Firefly falls back to Terra's catalog data (no opening hours or categories). |
| Tripadvisor 429 | Daily budget or rate limit reached (Discover: 10 requests/second, 10,000 calls/day) |
| No attractions in a town | Look in the function log for `Tripadvisor allowlist updated`. If it's missing, adding places to the allowlist failed. |
| Kids' texts are plain Wikipedia | The Anthropic account has no credit (`npm run check:apis -- --only anthropic` shows "credit balance is too low") |
| No live Google events, `google-events:skipped-monthly-budget` | The month's SerpApi searches are reserved for the weekly job; they renew on the 9th, or upgrade the plan |
| Hotels without prices | Neither Agoda (credentials/city id) nor Google Hotels (SerpApi budget) answered: see `tried` in the `hotelsNear` answer |
| Google answers 403 | Geocoding or Routes API not enabled, or the server key restricted to other APIs |
| No events in Israel / Africa / Latin America | `sources` lacks `google-events`: set `SERPAPI_KEY` |
| The app closes (or the Events page goes white) when the map starts; logcat shows `FATAL EXCEPTION: androidmapsapi…` `API key not found` | The Android project was built without the Maps key. Make sure `GOOGLE_MAPS_ANDROID_KEY` is in `.env`, then regenerate the Android folder so it picks the key up: `npx.cmd expo prebuild --clean --platform android`, then `npx.cmd expo run:android --variant release`. (`expo run:android` reuses an existing `android` folder as it is, so changes to `.env` or `app.config.ts` only reach the app after a `prebuild --clean`.) |
| Blank map on the phone (grey or beige box with only the Google logo; the rest of the Events page works) | Quickest check: open Events, then run `adb logcat -d | findstr /C:"Authorization failure" /C:"Android Application"`. If Google printed *Authorization failure*, the line *Android Application (<cert_fingerprint>;<package_name>)* shows the exact SHA-1 and package to add to the key in Google Cloud → Credentials (and *Maps SDK for Android* must be enabled and allowed for that key). No such line = the key is fine. Otherwise: the Maps Android key isn't restricted to the right SHA-1. Builds from `npx expo run:android` are signed with `android/app/debug.keystore`: run `android\gradlew.bat signingReport` and use the SHA-1 under **`:app`**, `Variant: release` (the library modules list a different keystore). EAS builds use the EAS keystore's SHA-1. A key can list several SHA-1s. |
| Weekend tab: "Location unavailable" on the emulator | The emulator has no location set: ⋯ (Extended controls) → Location → pick a place → **Set location**. Meanwhile the tab searches the last area used, or Tel Aviv, after 6 seconds. |
| Building a trip takes a long time | The first trip after a quiet spell waits for the server functions to start, and new towns aren't cached yet. The progress window shows the seconds and has **Cancel**. If it's still slow, look at `firebase functions:log` for the slow step. To keep one function always running, add `minInstances: 1` to it; that is billed even when idle. |
| Booking e-mail not arriving | Wrong Gmail app password, or check spam; `firebase functions:log --only onBookingCreated` |
| E-mail arrives without the passport link | Grant **Service Account Token Creator** (§2) |
| The PayPal page doesn't return to the app | The return URL must stay `https://www.differentroute.net/?firefly=paypal-return`; the app intercepts it |
| "E-mail log-in is turned off in Firebase" | Firebase console → Authentication → Sign-in method → enable **Email/Password** |
| *Continue as guest* works but events and trips don't load | **Anonymous** sign-in is off: Authentication → Sign-in method → enable **Anonymous** (guests use an anonymous session to call the server) |
| Hebrew layout not flipped | The app must restart after switching; it does this automatically in release builds. In development, reload manually |
