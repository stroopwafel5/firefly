import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  runTransaction,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import type { Lang } from '../i18n/localized';
import { UserDoc, buildSearchKeys } from '../models';
import { auth, db, storage } from './firebase';

export type ListField =
  | 'bookedCamps'
  | 'favouriteCamps'
  | 'bookedEvents'
  | 'favouriteEvents'
  | 'myTrips'
  | 'favouriteAttraction'
  | 'friends';

export class UserNameTakenError extends Error {}

export async function signUp(email: string, password: string, name: string, userName: string, lang: Lang) {
  const handle = userName.trim().toLowerCase();
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  const uid = cred.user.uid;
  try {
    await runTransaction(db, async (tx) => {
      const nameRef = doc(db, 'usernames', handle);
      if ((await tx.get(nameRef)).exists()) throw new UserNameTakenError();
      tx.set(nameRef, { uid });
      const user: UserDoc = {
        uid,
        userName: handle,
        searchKeys: buildSearchKeys(handle, name),
        name: name.trim(),
        description: '',
        dateOfBirth: null,
        photo: '',
        bookedCamps: [],
        favouriteCamps: [],
        bookedEvents: [],
        favouriteEvents: [],
        myTrips: [],
        favouriteAttraction: [],
        friends: [],
        language: lang,
        createdAt: Date.now(),
      };
      tx.set(doc(db, 'users', uid), user);
    });
    await updateProfile(cred.user, { displayName: name.trim() });
  } catch (e) {
    await cred.user.delete().catch(() => undefined);
    throw e;
  }
}

export async function signIn(email: string, password: string) {
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email.trim());
}

/** The message to show for a failed log-in or sign-up (Firebase error codes → texts in i18n). */
export function authErrorKey(e: unknown):
  | 'user.userNameTaken'
  | 'auth.err.credentials'
  | 'auth.err.emailInUse'
  | 'auth.err.weakPassword'
  | 'auth.err.email'
  | 'auth.err.network'
  | 'auth.err.tooMany'
  | 'auth.err.disabled'
  | 'common.error' {
  if (e instanceof UserNameTakenError) return 'user.userNameTaken';
  const code = (e as { code?: string } | null)?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'auth.err.credentials';
    case 'auth/email-already-in-use':
      return 'auth.err.emailInUse';
    case 'auth/weak-password':
      return 'auth.err.weakPassword';
    case 'auth/invalid-email':
    case 'auth/missing-email':
      return 'auth.err.email';
    case 'auth/network-request-failed':
      return 'auth.err.network';
    case 'auth/too-many-requests':
      return 'auth.err.tooMany';
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'auth.err.disabled';
    default:
      return 'common.error';
  }
}

export async function signOut() {
  await fbSignOut(auth);
}

export async function toggleInList(uid: string, field: ListField, id: string | number, on: boolean) {
  await updateDoc(doc(db, 'users', uid), { [field]: on ? arrayUnion(id) : arrayRemove(id) });
}

export async function updateUserProfile(
  uid: string,
  patch: Partial<Pick<UserDoc, 'name' | 'description' | 'dateOfBirth' | 'photo' | 'language'>>,
) {
  const current = await getDoc(doc(db, 'users', uid));
  const data = current.data() as UserDoc | undefined;
  const extra = patch.name && data ? { searchKeys: buildSearchKeys(data.userName, patch.name) } : {};
  await setDoc(doc(db, 'users', uid), { ...patch, ...extra }, { merge: true });
}

export async function uploadProfilePhoto(uid: string, localUri: string): Promise<string> {
  const blob = await (await fetch(localUri)).blob();
  const r = ref(storage, `profilePhotos/${uid}/${Date.now()}.jpg`);
  await uploadBytes(r, blob, { contentType: 'image/jpeg' });
  return getDownloadURL(r);
}

export async function getUser(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserDoc) : null;
}
