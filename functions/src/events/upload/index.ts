import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { geocodeText } from '../../google';
import { claude, fetchPage, wikiPhoto } from './services';
import { ANTHROPIC_API_KEY, EVENTS_AI_MODEL, EVENTS_UPLOAD_PASSCODE, GOOGLE_SERVER_KEY } from '../../params';
import { mapLimit, secret, sha1 } from '../../util';
import { GuardState, afterFailure, checkPasscode, readPasscodes } from './passcode';
import { ListedEvent, ListLang, defaultWeekStart, parseEventList } from './parse';
import { ItemResult, ProcessDeps, processListedEvent } from './process';

/**
 * The admin upload page (hosting/upload) talks to `eventsUpload` through the Firebase Hosting
 * rewrite /api/events-upload. Every call carries the passcode.
 *
 *   preview  → how the list was read (days, titles, links), nothing is saved
 *   start    → saves the list as a job (eventUploads/{id}); `processEventsUpload` then reads each
 *              page, publishes the events to `events` and writes progress into the job
 *   status   → the job's progress and results
 *   list     → uploaded events that are still upcoming
 *   remove   → takes one uploaded event down
 */

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const MAX_TEXT = 60_000;

function clientKey(req: { ip?: string; headers: Record<string, string | string[] | undefined> }): string {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd ?? '').split(',')[0].trim() || req.ip || 'unknown';
  return sha1(`upload-guard:${ip}`);
}

export const eventsUpload = onRequest({ secrets: [EVENTS_UPLOAD_PASSCODE], timeoutSeconds: 60, memory: '256MiB', maxInstances: 3 }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const body = (typeof req.body === 'object' && req.body ? req.body : {}) as Record<string, unknown>;
  const configured = secret(EVENTS_UPLOAD_PASSCODE);
  if (!readPasscodes(configured).length) {
    res.status(503).json({ error: 'Uploads are switched off: set EVENTS_UPLOAD_PASSCODE (see HOW_TO_TEST.md §5.4).' });
    return;
  }

  // Wrong passcodes: 8 tries per 15 minutes per address.
  const db = getFirestore();
  const guardRef = db.collection('uploadGuard').doc(clientKey(req));
  const guard = (await guardRef.get()).data() as GuardState | undefined;
  const now = Date.now();
  if (guard && guard.lockedUntil > now) {
    res.status(429).json({ error: `Too many wrong passcodes. Try again in ${Math.ceil((guard.lockedUntil - now) / 60_000)} min.` });
    return;
  }
  const admin = checkPasscode(configured, body.passcode);
  if (!admin) {
    await guardRef.set(afterFailure(guard, now));
    res.status(401).json({ error: 'Wrong passcode.' });
    return;
  }
  if (guard) await guardRef.delete().catch(() => undefined);

  try {
    const action = String(body.action ?? '');
    if (action === 'check') {
      res.json({ ok: true, admin });
      return;
    }
    if (action === 'preview' || action === 'start') {
      const text = typeof body.text === 'string' ? body.text.slice(0, MAX_TEXT) : '';
      const weekStart = isDay(body.weekStart) ? body.weekStart : defaultWeekStart(today());
      const parsed = parseEventList(text, weekStart);
      if (!parsed.items.length) {
        res.status(400).json({ error: 'No events found in the file. Each event needs a title line and its link on the next line.', parsed });
        return;
      }
      if (action === 'preview') {
        res.json({ parsed });
        return;
      }
      const ref = db.collection('eventUploads').doc();
      await ref.set({
        admin,
        createdAt: now,
        weekStart,
        listLang: parsed.lang,
        items: parsed.items,
        total: parsed.items.length,
        done: 0,
        status: 'queued',
        results: {},
      });
      res.json({ jobId: ref.id, total: parsed.items.length });
      return;
    }
    if (action === 'status') {
      const id = typeof body.jobId === 'string' ? body.jobId : '';
      const snap = id ? await db.collection('eventUploads').doc(id).get() : null;
      if (!snap?.exists) {
        res.status(404).json({ error: 'Upload not found.' });
        return;
      }
      const d = snap.data() as Record<string, unknown>;
      res.json({ jobId: id, status: d.status, total: d.total, done: d.done, error: d.error ?? null, results: d.results ?? {}, items: d.items });
      return;
    }
    if (action === 'list') {
      const snap = await db.collection('events').where('endDate', '>=', today()).limit(500).get();
      type Stored = { id: string; uploadId?: unknown; i18n?: { name?: unknown }; name: string; startDate: string; endDate: string; startTime?: string; venue: string; link: string; photo_urls?: string[]; uploadedBy?: string };
      const events = (snap.docs as Array<{ id: string; data(): unknown }>)
        .map((d): Stored => ({ ...(d.data() as Omit<Stored, 'id'>), id: d.id }))
        .filter((x: Stored) => typeof x.uploadId === 'string')
        .map((x: Stored) => ({ id: x.id, name: x.i18n?.name ?? { en: x.name }, startDate: x.startDate, endDate: x.endDate, startTime: x.startTime ?? '', venue: x.venue, link: x.link, photo: x.photo_urls?.[0] ?? '', uploadedBy: x.uploadedBy ?? '' }))
        .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.startTime.localeCompare(b.startTime));
      res.json({ events });
      return;
    }
    if (action === 'remove') {
      const id = typeof body.id === 'string' ? body.id : '';
      const ref = id ? db.collection('events').doc(id) : null;
      const snap = ref ? await ref.get() : null;
      if (!snap?.exists || typeof snap.data()?.uploadId !== 'string') {
        res.status(404).json({ error: 'Not an uploaded event.' });
        return;
      }
      await ref!.delete();
      logger.info('uploaded event removed', { id, by: admin });
      res.json({ ok: true });
      return;
    }
    res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    logger.error('eventsUpload failed', e);
    res.status(500).json({ error: 'Something went wrong on the server. Try again in a minute.' });
  }
});

/* ---------------- processing a saved list ---------------- */

/** An error that will repeat for every event (no credit, bad key): stop instead of trying them all. */
const FATAL = /credit balance|authentication|invalid x-api-key|api key|permission|Claude is not configured/i;

export const processEventsUpload = onDocumentCreated(
  { document: 'eventUploads/{id}', secrets: [ANTHROPIC_API_KEY, GOOGLE_SERVER_KEY], timeoutSeconds: 540, memory: '1GiB' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const job = snap.data() as { items: ListedEvent[]; admin: string; weekStart: string; listLang: ListLang };
    const ref = snap.ref;
    const db = getFirestore();
    const key = secret(ANTHROPIC_API_KEY);
    const gkey = secret(GOOGLE_SERVER_KEY);
    await ref.update({ status: 'running', startedAt: Date.now() });

    let fatal: string | null = key ? null : 'Claude is not configured: set ANTHROPIC_API_KEY (and add credit to the account).';
    const deps: ProcessDeps = {
      fetchPage,
      ai: claude(key),
      geocode: async (q) => geocodeText(q, 'en', gkey),
      wikiPhoto,
      model: EVENTS_AI_MODEL.value() || 'claude-sonnet-5-5',
      today: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }),
    };
    const counts = { published: 0, held: 0, failed: 0 };
    const started = Date.now();
    await mapLimit(job.items, 4, async (listed, i) => {
      let result: ItemResult;
      if (fatal) result = { index: i, title: listed.title, url: listed.url, status: 'failed', reasons: [fatal], warnings: [] };
      else if (Date.now() - started > 450_000) {
        result = { index: i, title: listed.title, url: listed.url, status: 'failed', reasons: ['Time limit reached — upload the list again to finish the rest (events already published are kept, not doubled)'], warnings: [] };
      }
      else {
        try {
          const r = await processListedEvent(listed, i, { uploadId: ref.id, admin: job.admin, listLang: job.listLang, weekStart: job.weekStart }, deps);
          result = r.result;
          if (r.event) await db.collection('events').doc(r.event.id).set(JSON.parse(JSON.stringify(r.event)));
          if (result.status === 'failed' && FATAL.test(result.reasons.join(' '))) fatal = result.reasons[0];
        } catch (e) {
          logger.error('event upload item failed', { i, url: listed.url, error: (e as Error).message });
          result = { index: i, title: listed.title, url: listed.url, status: 'failed', reasons: [(e as Error).message], warnings: [] };
        }
      }
      counts[result.status]++;
      await ref.update({ [`results.${i}`]: JSON.parse(JSON.stringify(result)), done: FieldValue.increment(1) });
    });
    await ref.update({ status: 'done', finishedAt: Date.now(), ...counts, error: fatal });
    logger.info('events upload processed', { id: ref.id, ...counts });
  },
);
