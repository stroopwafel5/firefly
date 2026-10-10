import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import type { UserDoc } from '../models';
import { api } from './api';
import { db } from './firebase';

/**
 * People, friends, person-to-person chat and in-app notifications.
 *  - Search: prefix match on users.searchKeys (built from username + name).
 *  - Friends: requests go through Cloud Functions so both users' friend lists stay consistent.
 *  - Chat: chats/{a_b} with a messages sub-collection, live via Firestore listeners —
 *    a direct conversation between two users (only the two participants can read it).
 *  - Notifications: users/{uid}/notifications, written only by Cloud Functions; shown in the
 *    app, never e-mailed.
 */

export async function searchPeople(text: string, myUid: string): Promise<UserDoc[]> {
  const q = text.trim().toLowerCase().split(/\s+/)[0];
  if (!q) return [];
  const snap = await getDocs(query(collection(db, 'users'), where('searchKeys', 'array-contains', q), limit(25)));
  return snap.docs.map((d) => d.data() as UserDoc).filter((u) => u.uid !== myUid);
}

export interface FriendRequest {
  from: string;
  to: string;
  fromName: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
}

export function watchIncomingRequests(uid: string, cb: (r: FriendRequest[]) => void) {
  return onSnapshot(
    query(collection(db, 'friendRequests'), where('to', '==', uid), where('status', '==', 'pending')),
    (s) => cb(s.docs.map((d) => d.data() as FriendRequest)),
  );
}

export function watchOutgoingRequests(uid: string, cb: (to: string[]) => void) {
  return onSnapshot(
    query(collection(db, 'friendRequests'), where('from', '==', uid), where('status', '==', 'pending')),
    (s) => cb(s.docs.map((d) => (d.data() as FriendRequest).to)),
  );
}

export const sendFriendRequest = (toUid: string) => api.sendFriendRequest({ toUid });
export const respondFriendRequest = (fromUid: string, accept: boolean) => api.respondFriendRequest({ fromUid, accept });

export async function getUsers(uids: string[]): Promise<UserDoc[]> {
  const out: UserDoc[] = [];
  for (let i = 0; i < uids.length; i += 10) {
    const chunk = uids.slice(i, i + 10);
    if (!chunk.length) continue;
    const snap = await getDocs(query(collection(db, 'users'), where('uid', 'in', chunk)));
    out.push(...snap.docs.map((d) => d.data() as UserDoc));
  }
  return out;
}

/* ---------------- chat ---------------- */

export function chatId(a: string, b: string) {
  return [a, b].sort().join('_');
}

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  createdAt: number;
}

export async function ensureChat(me: string, other: string) {
  const id = chatId(me, other);
  await setDoc(doc(db, 'chats', id), { members: [me, other].sort(), updatedAt: Date.now() }, { merge: true });
  return id;
}

export function watchMessages(id: string, cb: (m: ChatMessage[]) => void) {
  return onSnapshot(query(collection(db, 'chats', id, 'messages'), orderBy('createdAt', 'asc'), limit(200)), (s) =>
    cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) }))),
  );
}

export async function sendMessage(id: string, from: string, text: string) {
  const clean = text.trim().slice(0, 2000);
  if (!clean) return;
  await addDoc(collection(db, 'chats', id, 'messages'), { from, text: clean, createdAt: Date.now(), at: serverTimestamp() });
  await updateDoc(doc(db, 'chats', id), { updatedAt: Date.now(), lastText: clean.slice(0, 80) });
}

/* ---------------- notifications ---------------- */

export type NotificationType =
  | 'campBooked'
  | 'eventGoing'
  | 'tripCreated'
  | 'tripAdded'
  | 'friendRequest'
  | 'friendAccepted';

export interface AppNotification {
  id: string;
  type: NotificationType;
  fromUid: string;
  fromName: string;
  target: string;
  targetId: string;
  read: boolean;
  createdAt: number;
}

export function watchNotifications(uid: string, cb: (n: AppNotification[]) => void) {
  return onSnapshot(
    query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(100)),
    (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AppNotification, 'id'>) }))),
  );
}

export async function markRead(uid: string, id: string) {
  await updateDoc(doc(db, 'users', uid, 'notifications', id), { read: true });
}
