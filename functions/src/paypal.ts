import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV } from './params';
import { approveLink, paypalBase, paypalOrderBody, paypalTokenRequest } from './paypalCore';
import { fetchJson, requireAuth, requireString } from './util';

/**
 * PayPal Checkout (Orders API v2), server side so the client secret never leaves the server.
 *  1. createPaypalOrder → returns PayPal's approval URL; the app opens it in a WebView.
 *  2. PayPal redirects to PAYPAL_RETURN_URL; the app intercepts that URL (it never loads)
 *     and calls capturePaypalOrder.
 *  3. capture → booking.status = 'paid' → bookings.ts e-mails Different Route.
 * The amount always comes from the booking stored in Firestore, never from the app.
 */

export { PAYPAL_CANCEL_URL, PAYPAL_RETURN_URL } from './paypalCore';

const base = () => paypalBase(PAYPAL_ENV.value());

async function token(): Promise<string> {
  const [url, init] = paypalTokenRequest(PAYPAL_ENV.value(), PAYPAL_CLIENT_ID.value(), PAYPAL_CLIENT_SECRET.value());
  return (await fetchJson<{ access_token: string }>(url, init)).access_token;
}

async function loadBooking(uid: string, bookingId: string) {
  const ref = getFirestore().collection('campBookings').doc(bookingId);
  const snap = await ref.get();
  const b = snap.data() as { uid: string; price: number; campName: string; status: string; paypalOrderId?: string } | undefined;
  if (!b || b.uid !== uid) throw new HttpsError('not-found', 'Booking not found');
  return { ref, b };
}

export const createPaypalOrder = onCall({ secrets: [PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET] }, async (req) => {
  const uid = requireAuth(req);
  const bookingId = requireString((req.data as { bookingId?: string })?.bookingId, 'bookingId', 64);
  const { ref, b } = await loadBooking(uid, bookingId);
  if (b.status === 'paid') throw new HttpsError('failed-precondition', 'Already paid');
  // Charge the catalogue price (camps/{id}, written by scripts/seedFirestore.ts), never a client value.
  const campId = (b as unknown as { campId: number }).campId;
  const camp = (await getFirestore().collection('camps').doc(String(campId)).get()).data() as { price?: number; provider?: string } | undefined;
  if (!camp?.price) throw new HttpsError('failed-precondition', 'Camp catalogue not found — run the seed script');
  // Only Different Route's own camps are sold in the app for now.
  if ((camp.provider ?? 'Differentroute') !== 'Differentroute') throw new HttpsError('failed-precondition', 'This camp is booked with its own organiser');
  b.price = camp.price;
  await ref.update({ price: camp.price });
  const access = await token();
  const order = await fetchJson<{ id: string; links?: Array<{ rel: string; href: string }> }>(`${base()}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', 'PayPal-Request-Id': `firefly-${bookingId}` },
    body: JSON.stringify(paypalOrderBody(bookingId, b.campName, b.price)),
  });
  const approveUrl = approveLink(order);
  if (!approveUrl) throw new HttpsError('internal', 'PayPal did not return an approval link');
  await ref.update({ paypalOrderId: order.id, status: 'pending_payment' });
  return { orderId: order.id, approveUrl };
});

export const capturePaypalOrder = onCall({ secrets: [PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET] }, async (req) => {
  const uid = requireAuth(req);
  const d = (req.data ?? {}) as { bookingId?: string; orderId?: string };
  const bookingId = requireString(d.bookingId, 'bookingId', 64);
  const orderId = requireString(d.orderId, 'orderId', 64);
  const { ref, b } = await loadBooking(uid, bookingId);
  if (b.paypalOrderId !== orderId) throw new HttpsError('permission-denied', 'Order does not match booking');
  if (b.status === 'paid') return { status: 'COMPLETED' };
  const access = await token();
  try {
    const cap = await fetchJson<{ status: string; purchase_units?: Array<{ payments?: { captures?: Array<{ id: string }> } }> }>(
      `${base()}/v2/checkout/orders/${orderId}/capture`,
      { method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' } },
    );
    if (cap.status === 'COMPLETED') {
      await ref.update({
        status: 'paid',
        paidAt: FieldValue.serverTimestamp(),
        paypalCaptureId: cap.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? '',
      });
    } else {
      await ref.update({ status: 'payment_failed' });
    }
    return { status: cap.status };
  } catch {
    await ref.update({ status: 'payment_failed' });
    throw new HttpsError('aborted', 'Capture failed');
  }
});
