import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { defineString } from 'firebase-functions/params';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { ANTHROPIC_URL, anthropicHeaders, kidifyRequest, kidifyText } from './kidifyCore';
import { ANTHROPIC_API_KEY } from './params';
import { DAY, cached, requireAuth, requireString, secret, sha1 } from './util';

const KIDIFY_MODEL = defineString('KIDIFY_MODEL', { default: 'claude-haiku-5-5' });

/**
 * Optional: rephrases a sourced Wikipedia intro for 7–10 year olds in the app language.
 * It may only reuse facts that are in the given text (the source link stays the same).
 * Without ANTHROPIC_API_KEY the app shows the Wikipedia intro as is.
 */
export const kidify = onCall({ secrets: [ANTHROPIC_API_KEY] }, async (req) => {
  requireAuth(req);
  const d = (req.data ?? {}) as { text?: string; lang?: string; title?: string };
  const key = secret(ANTHROPIC_API_KEY);
  if (!key) return { text: null };
  const text = requireString(d.text, 'text', 2000);
  const lang = d.lang === 'he' || d.lang === 'ru' ? d.lang : 'en';
  const { value } = await cached(`kidify:${lang}:${sha1(text)}`, 30 * DAY, async () => {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(20_000),
      headers: anthropicHeaders(key),
      body: JSON.stringify(kidifyRequest(text, lang, d.title ?? '', KIDIFY_MODEL.value())),
    });
    if (!res.ok) {
      logger.warn('kidify failed', res.status);
      return null;
    }
    return kidifyText((await res.json()) as { content?: Array<{ type: string; text?: string }> });
  }, (v) => v != null); // a failed call is retried next time, not cached
  return { text: value };
});

/** "Report this photo": hides it everywhere until an admin reviews it (hiddenPhotos/{sha1(url)}). */
export const reportPhoto = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = (req.data ?? {}) as { url?: string; sourcePage?: string; itemId?: string; reason?: string };
  const url = requireString(d.url, 'url', 2000);
  const db = getFirestore();
  await db.collection('photoReports').add({
    url,
    sourcePage: d.sourcePage ?? '',
    itemId: d.itemId ?? '',
    reason: (d.reason ?? '').slice(0, 300),
    uid,
    createdAt: Date.now(),
  });
  await db.collection('hiddenPhotos').doc(sha1(url)).set({ url, reportedAt: Date.now() }, { merge: true });
  return { ok: true };
});

/**
 * Daily check that every camp page on differentroute.net still answers, so a broken link
 * (like /armenia-camp returning 404 on 9 Oct 2026) shows up in Firestore (campPageStatus).
 */
export const checkCampPages = onSchedule({ schedule: 'every day 05:00', timeZone: 'Asia/Jerusalem' }, async () => {
  const db = getFirestore();
  const camps = await db.collection('camps').get();
  for (const doc of camps.docs) {
    const link = (doc.data() as { link?: string }).link;
    if (!link) continue;
    let status = 0;
    try {
      status = (await fetch(link, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(10_000) })).status;
    } catch {
      status = -1;
    }
    await db.collection('campPageStatus').doc(doc.id).set({ link, status, checkedAt: Date.now() });
    if (status !== 200) logger.warn('camp page not OK', { link, status });
  }
});
