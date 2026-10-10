import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { EventJSON, validateEvent } from './events/types';
import { requireAuth, requireString } from './util';

/**
 * Friends, "I'm going", trips shared with friends, and in-app notifications.
 * Notifications are stored at users/{uid}/notifications with structured fields so each
 * reader sees them in their own language. They are never e-mailed.
 */

type NotificationType = 'campBooked' | 'eventGoing' | 'tripCreated' | 'tripAdded' | 'friendRequest' | 'friendAccepted';

const db = () => getFirestore();

async function userName(uid: string): Promise<{ name: string; friends: string[] }> {
  const u = (await db().collection('users').doc(uid).get()).data() as { name?: string; userName?: string; friends?: string[] } | undefined;
  return { name: u?.name || u?.userName || 'Someone', friends: u?.friends ?? [] };
}

export async function notify(toUids: string[], type: NotificationType, fromUid: string, target: string, targetId: string) {
  if (!toUids.length) return;
  const { name } = await userName(fromUid);
  const batch = db().batch();
  for (const to of toUids.slice(0, 400)) {
    batch.set(db().collection('users').doc(to).collection('notifications').doc(), {
      type,
      fromUid,
      fromName: name,
      target,
      targetId,
      read: false,
      createdAt: Date.now(),
    });
  }
  await batch.commit();
}

export async function notifyFriends(uid: string, type: NotificationType, target: string, targetId: string) {
  const { friends } = await userName(uid);
  await notify(friends, type, uid, target, targetId);
}

export const sendFriendRequest = onCall(async (req) => {
  const uid = requireAuth(req);
  const to = requireString((req.data as { toUid?: string })?.toUid, 'toUid', 128);
  if (to === uid) throw new HttpsError('invalid-argument', 'That is you');
  const target = await db().collection('users').doc(to).get();
  if (!target.exists) throw new HttpsError('not-found', 'No such user');
  const me = await userName(uid);
  if (me.friends.includes(to)) return { ok: true };
  await db().collection('friendRequests').doc(`${uid}_${to}`).set({ from: uid, to, fromName: me.name, status: 'pending', createdAt: Date.now() });
  await notify([to], 'friendRequest', uid, '', uid);
  return { ok: true };
});

export const respondFriendRequest = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = (req.data ?? {}) as { fromUid?: string; accept?: boolean };
  const from = requireString(d.fromUid, 'fromUid', 128);
  const ref = db().collection('friendRequests').doc(`${from}_${uid}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.status !== 'pending') throw new HttpsError('not-found', 'No pending request');
  await ref.update({ status: d.accept ? 'accepted' : 'declined' });
  if (d.accept) {
    const batch = db().batch();
    batch.update(db().collection('users').doc(uid), { friends: FieldValue.arrayUnion(from) });
    batch.update(db().collection('users').doc(from), { friends: FieldValue.arrayUnion(uid) });
    await batch.commit();
    await notify([from], 'friendAccepted', uid, '', uid);
  }
  return { ok: true };
});

async function storeEvent(event: unknown): Promise<EventJSON> {
  const e = event as EventJSON;
  if (!e || typeof e !== 'object' || validateEvent(e).length) throw new HttpsError('invalid-argument', 'Event failed validation');
  await db().collection('savedEvents').doc(e.id).set({ ...e, savedAt: Date.now() }, { merge: true });
  return e;
}

/** "I'm going": marks the event on the profile and tells friends in the app. */
export const setGoing = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = (req.data ?? {}) as { eventId?: string; going?: boolean; event?: unknown };
  const eventId = requireString(d.eventId, 'eventId', 200);
  const e = d.event ? await storeEvent(d.event) : null;
  await db()
    .collection('users')
    .doc(uid)
    .update({ bookedEvents: d.going ? FieldValue.arrayUnion(eventId) : FieldValue.arrayRemove(eventId) });
  if (d.going) await notifyFriends(uid, 'eventGoing', e?.name ?? eventId, eventId);
  return { ok: true };
});

export const saveEvent = onCall(async (req) => {
  requireAuth(req);
  await storeEvent((req.data as { event?: unknown })?.event);
  return { ok: true };
});

/** Adds friends to a trip: they get it in "My trips" and an in-app notification. */
export const addTripPeople = onCall(async (req) => {
  const uid = requireAuth(req);
  const d = (req.data ?? {}) as { tripId?: string; uids?: string[] };
  const tripId = requireString(d.tripId, 'tripId', 64);
  const ref = db().collection('trips').doc(tripId);
  const trip = (await ref.get()).data() as { people?: string[]; name?: string } | undefined;
  if (!trip?.people?.includes(uid)) throw new HttpsError('permission-denied', 'Not your trip');
  const { friends } = await userName(uid);
  const add = (d.uids ?? []).filter((u) => friends.includes(u) && !trip.people!.includes(u));
  if (!add.length) return { ok: true };
  const batch = db().batch();
  batch.update(ref, { people: FieldValue.arrayUnion(...add) });
  add.forEach((u) => batch.update(db().collection('users').doc(u), { myTrips: FieldValue.arrayUnion(tripId) }));
  await batch.commit();
  await notify(add, 'tripAdded', uid, trip.name ?? '', tripId);
  return { ok: true };
});

/** A new trip tells the owner's friends ("is planning a trip"). */
export const onTripCreated = onDocumentCreated('trips/{tripId}', async (event) => {
  const t = event.data?.data() as { ownerId?: string; name?: string } | undefined;
  if (t?.ownerId) await notifyFriends(t.ownerId, 'tripCreated', t.name ?? '', event.params.tripId);
});
