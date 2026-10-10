import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Trip, TripJSON } from '../models';
import { api } from './api';
import { db } from './firebase';

/**
 * Trips are stored at trips/{id}. The owner and everyone in `people` can read and edit them.
 * Creating a trip or adding someone notifies friends in-app (functions/src/social.ts).
 */

export async function saveTrip(trip: Trip, uid: string): Promise<string> {
  const id = String(trip.id);
  const json: TripJSON = { ...trip.toJSON(), ownerId: trip.ownerId || uid, createdAt: Date.now() };
  if (!json.people.includes(uid)) json.people = [uid, ...json.people];
  await setDoc(doc(db, 'trips', id), json);
  await updateDoc(doc(db, 'users', uid), { myTrips: arrayUnion(id) });
  return id;
}

export async function updateTrip(trip: Trip): Promise<void> {
  await setDoc(doc(db, 'trips', String(trip.id)), trip.toJSON(), { merge: true });
}

export async function getTrip(id: string): Promise<Trip | null> {
  const snap = await getDoc(doc(db, 'trips', id));
  return snap.exists() ? Trip.fromJSON(snap.data() as TripJSON) : null;
}

export async function myTrips(uid: string): Promise<Trip[]> {
  const snap = await getDocs(query(collection(db, 'trips'), where('people', 'array-contains', uid)));
  return snap.docs
    .map((d) => Trip.fromJSON(d.data() as TripJSON))
    .sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
}

export async function deleteTrip(id: string) {
  await deleteDoc(doc(db, 'trips', id));
}

/** Server-side so the added friends get their own copy in "My trips" and a notification. */
export async function addPeopleToTrip(tripId: string, uids: string[]) {
  await api.addTripPeople({ tripId, uids });
}
