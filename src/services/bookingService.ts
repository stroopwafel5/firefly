import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import type { Lang } from '../i18n/localized';
import { api } from './api';
import { db, storage } from './firebase';

/**
 * One registration, with exactly the fields of the Different Route JotForm
 * (https://form.jotform.com/262433669352462).
 */
export interface CampBooking {
  id: string;
  uid: string;
  campId: number;
  campName: string;
  /** The JotForm "Which camp would you like to join?" option. */
  campOption: string;
  price: number;
  currency: 'EUR';
  camper: {
    firstName: string;
    lastName: string;
    birthDate: string;
    gradeSchool: string;
    gender: 'Male' | 'Female';
    address: { street1: string; street2: string; city: string; state: string; postal: string };
    otherCampers: string;
    phone: string;
    passportPath: string;
    passportFileName: string;
  };
  parent: { firstName: string; lastName: string; areaCode: string; phone: string; email: string };
  emergency: {
    firstName: string;
    lastName: string;
    areaCode: string;
    phone: string;
    relationship: Relationship;
  };
  medical: string;
  inhaler: string;
  additional: string;
  termsAccepted: boolean;
  signatureDate: string;
  /** The drawn signature as SVG path data (rendered into the e-mail as an image). */
  signatureSvg: string;
  /** 'card' = credit card on Grow's secure page. */
  paymentMethod: 'paypal' | 'bank' | 'card';
  status: 'pending_payment' | 'paid' | 'bank_transfer_requested' | 'payment_failed';
  lang: Lang;
  createdAt: number;
}

export { RELATIONSHIPS } from './bookingRelationships';
export type { Relationship } from './bookingRelationships';
import type { Relationship } from './bookingRelationships';

export function newBookingId(): string {
  return doc(collection(db, 'campBookings')).id;
}

export async function uploadPassport(uid: string, bookingId: string, uri: string, name: string, mime: string) {
  const blob = await (await fetch(uri)).blob();
  const path = `bookings/${uid}/${bookingId}/${Date.now()}-${name.replace(/[^\w.-]/g, '_')}`;
  await uploadBytes(ref(storage, path), blob, { contentType: mime || 'application/octet-stream' });
  return path;
}

/**
 * Saves the registration. For bank transfer, a Cloud Function e-mails the full summary to
 * Different Route (dubinanna@gmail.com) straight away. For PayPal, the booking waits as
 * `pending_payment` until the PayPal order is captured; the function then e-mails it as paid.
 */
export async function submitBooking(b: CampBooking): Promise<void> {
  await setDoc(doc(db, 'campBookings', b.id), b);
}

export async function startPaypal(bookingId: string) {
  return api.createPaypalOrder({ bookingId });
}

export async function startGrow(bookingId: string) {
  return api.createGrowPayment({ bookingId });
}

export async function capturePaypal(bookingId: string, orderId: string) {
  return api.capturePaypalOrder({ bookingId, orderId });
}

export function watchBooking(id: string, cb: (b: CampBooking | null) => void) {
  return onSnapshot(doc(db, 'campBookings', id), (s) => cb(s.exists() ? (s.data() as CampBooking) : null));
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
export const isPhone = (s: string) => /^[+\d][\d\s-]{5,}$/.test(s.trim());
