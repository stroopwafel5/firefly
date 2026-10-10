import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { GROW_API_KEY, GROW_ENV, GROW_EUR_ILS, GROW_PAGE_CODE, GROW_USER_ID } from './params';
import { createFields, fullName, growUrl, ilsAmount, isPaidNotice, israeliMobile, parseMultipart, parseNotice } from './growCore';
import { requireAuth, requireString, secret } from './util';

/**
 * Card payments through Grow (growCore.ts explains the flow). The amount always comes from the
 * camp catalogue in Firestore, never from the app; the payment process id and token are kept in
 * `payments/{bookingId}`, which only the server can read.
 */

const GROW_SECRETS = [GROW_USER_ID, GROW_PAGE_CODE, GROW_API_KEY];

async function postForm<T>(url: string, fields: Record<string, string>): Promise<T> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Grow answered ${res.status}: ${text.slice(0, 200)}`);
  }
}

const notifyUrl = () => `https://europe-west1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/growNotify`;

export const createGrowPayment = onCall({ secrets: GROW_SECRETS }, async (req) => {
  const uid = requireAuth(req);
  const bookingId = requireString((req.data as { bookingId?: string })?.bookingId, 'bookingId', 64);
  const userId = secret(GROW_USER_ID);
  const pageCode = secret(GROW_PAGE_CODE);
  if (!userId || !pageCode) throw new HttpsError('failed-precondition', 'grow-not-configured');

  const db = getFirestore();
  const ref = db.collection('campBookings').doc(bookingId);
  const b = (await ref.get()).data() as
    | { uid: string; campId: number; campName: string; status: string; parent: { firstName: string; lastName: string; areaCode: string; phone: string; email: string } }
    | undefined;
  if (!b || b.uid !== uid) throw new HttpsError('not-found', 'Booking not found');
  if (b.status === 'paid') throw new HttpsError('failed-precondition', 'Already paid');
  const camp = (await db.collection('camps').doc(String(b.campId)).get()).data() as { price?: number; priceILS?: number; provider?: string } | undefined;
  if (!camp?.price) throw new HttpsError('failed-precondition', 'Camp catalogue not found — run the seed script');
  if ((camp.provider ?? 'Differentroute') !== 'Differentroute') throw new HttpsError('failed-precondition', 'This camp is booked with its own organiser');

  const phone = israeliMobile(b.parent.areaCode, b.parent.phone);
  if (!phone) throw new HttpsError('invalid-argument', 'grow-phone'); // Grow needs an Israeli mobile number
  const sum = ilsAmount(camp.price, Number(GROW_EUR_ILS.value()), camp.priceILS);

  const r = await postForm<{ status?: number | string; err?: unknown; data?: { url?: string; processId?: string | number; processToken?: string } }>(
    growUrl(GROW_ENV.value(), 'createPaymentProcess'),
    createFields({
      pageCode,
      userId,
      apiKey: secret(GROW_API_KEY) || undefined,
      sum,
      description: `Different Route — ${b.campName}`,
      fullName: fullName(b.parent.firstName, b.parent.lastName),
      phone,
      email: b.parent.email,
      notifyUrl: notifyUrl(),
      bookingId,
      uid,
    }),
  );
  if (String(r.status) !== '1' || !r.data?.url) {
    logger.error('Grow createPaymentProcess failed', { err: r.err, status: r.status });
    throw new HttpsError('unavailable', 'grow-failed');
  }
  await db.collection('payments').doc(bookingId).set({
    provider: 'grow',
    processId: String(r.data.processId ?? ''),
    processToken: String(r.data.processToken ?? ''),
    sumIls: sum,
    createdAt: Date.now(),
  });
  await ref.update({ status: 'pending_payment', paymentMethod: 'card', amountIls: sum });
  return { url: r.data.url, amountIls: sum };
});

/** Grow's server-to-server notice. Always answers 200 so Grow doesn't retry a rejected notice forever. */
export const growNotify = onRequest({ secrets: GROW_SECRETS }, async (req, res) => {
  try {
    const type = String(req.headers['content-type'] ?? '');
    const body =
      type.includes('multipart/form-data') && req.rawBody ? parseMultipart(req.rawBody.toString('utf8'), type) : (req.body as unknown);
    const n = parseNotice(body);
    if (!n.bookingId || !n.processId) {
      logger.warn('Grow notice without booking or process id', { keys: Object.keys(n.raw) });
      res.status(200).send('ignored');
      return;
    }
    const db = getFirestore();
    const pay = (await db.collection('payments').doc(n.bookingId).get()).data() as { processId: string; processToken: string; sumIls: number } | undefined;
    // It must be the process we created for this booking…
    if (!pay || pay.processId !== n.processId || (pay.processToken && n.processToken && pay.processToken !== n.processToken)) {
      logger.warn('Grow notice does not match a payment we started', { bookingId: n.bookingId });
      res.status(200).send('ignored');
      return;
    }
    // …and Grow itself must confirm it, for the right amount.
    const pageCode = secret(GROW_PAGE_CODE);
    const info = await postForm<{ status?: number | string; data?: unknown }>(growUrl(GROW_ENV.value(), 'getPaymentProcessInfo'), {
      pageCode,
      userId: secret(GROW_USER_ID),
      processId: n.processId,
      processToken: n.processToken || pay.processToken,
    }).catch((e) => {
      logger.warn('Grow getPaymentProcessInfo failed', e);
      return null;
    });
    const confirmed = info ? parseNotice(info) : null;
    const paid = isPaidNotice(n) && (!confirmed || !confirmed.statusCode || isPaidNotice(confirmed));
    const amountOk = !n.sum || Math.abs(n.sum - pay.sumIls) < 1;
    const ref = db.collection('campBookings').doc(n.bookingId);
    if (paid && amountOk) {
      await ref.update({ status: 'paid', paidAt: FieldValue.serverTimestamp(), growTransactionId: n.transactionId, amountIls: pay.sumIls });
      // Acknowledge to Grow (recommended; the payment stands either way).
      await postForm(growUrl(GROW_ENV.value(), 'approveTransaction'), { ...n.raw, pageCode, transactionId: n.transactionId }).catch((e) =>
        logger.warn('Grow approveTransaction failed', e),
      );
    } else {
      logger.warn('Grow notice not accepted as paid', { bookingId: n.bookingId, statusCode: n.statusCode, sum: n.sum, expected: pay.sumIls });
      if (!paid) await ref.update({ status: 'payment_failed' }).catch(() => undefined);
    }
    res.status(200).send('ok');
  } catch (e) {
    logger.error('Grow notice failed', e);
    res.status(200).send('error');
  }
});
