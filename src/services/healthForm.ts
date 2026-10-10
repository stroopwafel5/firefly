import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import type { CampBooking } from './bookingService';
import { db } from './firebase';
import type { HealthForm } from './healthFormCore';

export * from './healthFormCore';

/**
 * Health forms live in Firestore `healthForms/{bookingId}`, readable only by the parent who
 * booked and by Different Route's admins (firestore.rules). They are not e-mailed: the signed
 * paper copy travels with the child.
 */

export async function loadHealthForm(bookingId: string): Promise<HealthForm | null> {
  const snap = await getDoc(doc(db, 'healthForms', bookingId));
  return snap.exists() ? (snap.data() as HealthForm) : null;
}

export async function saveHealthForm(f: HealthForm): Promise<void> {
  await setDoc(doc(db, 'healthForms', f.bookingId), { ...f, updatedAt: Date.now() });
}

/** The parent's camp bookings (newest first), each with whether its health form is filled in. */
export async function myCampBookings(uid: string): Promise<Array<{ booking: CampBooking; formComplete: boolean }>> {
  const snap = await getDocs(query(collection(db, 'campBookings'), where('uid', '==', uid)));
  // Confirmed bookings only: paid, or registered for bank transfer.
  const bookings = snap.docs.map((d) => d.data() as CampBooking).filter((b) => b.status === 'paid' || b.status === 'bank_transfer_requested');
  bookings.sort((a, b) => b.createdAt - a.createdAt);
  return Promise.all(
    bookings.map(async (booking) => ({ booking, formComplete: !!(await loadHealthForm(booking.id).catch(() => null))?.complete })),
  );
}

/** Makes the PDF and opens the share sheet, where it can be saved to the phone or Drive, or printed. */
export async function saveHealthFormPdf(html: string, title: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title, UTI: 'com.adobe.pdf' });
  }
}

/** Opens the phone's print dialog (which also offers "Save as PDF"). */
export async function printHealthForm(html: string): Promise<void> {
  await Print.printAsync({ html });
}
