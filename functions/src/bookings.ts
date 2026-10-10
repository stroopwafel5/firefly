import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import nodemailer from 'nodemailer';
import { BOOKINGS_EMAIL, SMTP_HOST, SMTP_PASS, SMTP_USER } from './params';
import { notifyFriends } from './social';

/**
 * Camp registrations.
 *  - Bank transfer: as soon as the registration is saved, the full summary is e-mailed to
 *    Different Route (BOOKINGS_EMAIL, default dubinanna@gmail.com), who reply with bank details.
 *  - PayPal: e-mailed once the payment is captured (status → 'paid').
 * In both cases the camp is added to the user's "Booked camps" and friends are notified in-app.
 */

interface Booking {
  id: string;
  uid: string;
  campId: number;
  campName: string;
  campOption: string;
  price: number;
  camper: {
    firstName: string;
    lastName: string;
    birthDate: string;
    gradeSchool: string;
    gender: string;
    address: { street1: string; street2: string; city: string; state: string; postal: string };
    otherCampers: string;
    phone: string;
    passportPath: string;
    passportFileName: string;
  };
  parent: { firstName: string; lastName: string; areaCode: string; phone: string; email: string };
  emergency: { firstName: string; lastName: string; areaCode: string; phone: string; relationship: string };
  medical: string;
  inhaler: string;
  additional: string;
  termsAccepted: boolean;
  signatureDate: string;
  signatureSvg: string;
  paymentMethod: 'paypal' | 'bank' | 'card';
  status: string;
  paypalCaptureId?: string;
  growTransactionId?: string;
  amountIls?: number;
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

export function bookingEmailHtml(b: Booking, passportUrl: string | null): string {
  const row = (k: string, v: unknown) => `<tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`;
  const section = (title: string, rows: string) => `<h3 style="margin:18px 0 6px">${esc(title)}</h3><table>${rows}</table>`;
  const a = b.camper.address;
  return `<div style="font-family:Arial,sans-serif;font-size:14px">
<h2>${b.paymentMethod === 'bank' ? 'New registration — bank transfer requested' : b.paymentMethod === 'card' ? 'New registration — paid by card (Grow)' : 'New registration — paid with PayPal'}</h2>
<p>Camp: <b>${esc(b.campOption)}</b><br>Amount: <b>€${esc(b.price)}</b>${b.paypalCaptureId ? `<br>PayPal capture: ${esc(b.paypalCaptureId)}` : ''}${b.growTransactionId ? `<br>Grow transaction: ${esc(b.growTransactionId)} (₪${esc(b.amountIls ?? '')})` : ''}<br>Booking id: ${esc(b.id)}</p>
${section('Camper Information', [
  row("Camper's Name", `${b.camper.firstName} ${b.camper.lastName}`),
  row('Birth Date', b.camper.birthDate),
  row('Grade, School Information', b.camper.gradeSchool),
  row('Gender', b.camper.gender),
  row('Address', [a.street1, a.street2, a.city, a.state, a.postal].filter(Boolean).join(', ')),
  row('Other campers travelling together', b.camper.otherCampers),
  row("Camper's contact phone number", b.camper.phone),
  row("Camper's passport", passportUrl ? `${b.camper.passportFileName} (link below, valid 30 days)` : 'not attached'),
].join(''))}
${passportUrl ? `<p><a href="${esc(passportUrl)}">Open passport file</a></p>` : ''}
${section('Parent/Guardian Information', [
  row('Name', `${b.parent.firstName} ${b.parent.lastName}`),
  row('Phone Number', `${b.parent.areaCode} ${b.parent.phone}`),
  row('E-mail', b.parent.email),
].join(''))}
${section('Emergency Information', [
  row("Emergency Contact's Name", `${b.emergency.firstName} ${b.emergency.lastName}`),
  row('Phone Number', `${b.emergency.areaCode} ${b.emergency.phone}`),
  row('Relationship', b.emergency.relationship),
  row('Allergies, chronic illness or medical conditions', b.medical),
  row('Inhaler', b.inhaler),
  row('Additional Information', b.additional),
].join(''))}
${section('Confirmation', [
  row('Terms and Conditions accepted', b.termsAccepted ? 'Yes' : 'No'),
  row('Date', b.signatureDate),
  row('Signature', 'attached (signature.svg)'),
].join(''))}
<p style="color:#888;font-size:12px">Sent automatically by the Firefly app.</p></div>`;
}

function signatureSvg(path: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200" width="600" height="200"><rect width="600" height="200" fill="#fff"/><path d="${path.replace(/[^MLQCZmlqcz0-9.,\s-]/g, '')}" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

async function sendBookingEmail(b: Booking) {
  let passportUrl: string | null = null;
  if (b.camper.passportPath) {
    try {
      [passportUrl] = await getStorage()
        .bucket()
        .file(b.camper.passportPath)
        .getSignedUrl({ action: 'read', expires: Date.now() + 30 * 24 * 3600 * 1000 });
    } catch (e) {
      logger.warn('could not sign passport URL', e);
    }
  }
  const transport = nodemailer.createTransport({
    host: SMTP_HOST.value(),
    port: 465,
    secure: true,
    auth: { user: SMTP_USER.value(), pass: SMTP_PASS.value() },
  });
  await transport.sendMail({
    from: `"Firefly bookings" <${SMTP_USER.value()}>`,
    to: BOOKINGS_EMAIL.value(),
    replyTo: b.parent.email,
    subject: `${b.paymentMethod === 'bank' ? '[Bank transfer]' : b.paymentMethod === 'card' ? '[PAID · Card]' : '[PAID · PayPal]'} ${b.campOption} — ${b.camper.firstName} ${b.camper.lastName}`,
    html: bookingEmailHtml(b, passportUrl),
    attachments: b.signatureSvg ? [{ filename: 'signature.svg', content: signatureSvg(b.signatureSvg), contentType: 'image/svg+xml' }] : [],
  });
}

async function markBooked(b: Booking) {
  await getFirestore().collection('users').doc(b.uid).update({ bookedCamps: FieldValue.arrayUnion(b.campId) }).catch(() => undefined);
  await notifyFriends(b.uid, 'campBooked', b.campName, String(b.campId));
}

const MAIL_SECRETS = [SMTP_USER, SMTP_PASS];

export const onBookingCreated = onDocumentCreated({ document: 'campBookings/{id}', secrets: MAIL_SECRETS }, async (event) => {
  const b = event.data?.data() as Booking | undefined;
  if (!b || b.paymentMethod !== 'bank') return;
  await sendBookingEmail(b);
  await event.data!.ref.update({ emailedAt: Date.now() });
  await markBooked(b);
});

export const onBookingPaid = onDocumentUpdated({ document: 'campBookings/{id}', secrets: MAIL_SECRETS }, async (event) => {
  const before = event.data?.before.data() as Booking | undefined;
  const after = event.data?.after.data() as Booking | undefined;
  if (!after || before?.status === 'paid' || after.status !== 'paid') return;
  await sendBookingEmail(after);
  await event.data!.after.ref.update({ emailedAt: Date.now() });
  await markBooked(after);
});
