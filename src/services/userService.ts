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
import { UserDoc, buildSearchKeys, normalizeUser } from '../models';

export { normalizeUser };
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

/**
 * Uploads a photo from the phone and returns its address. The file is read with XMLHttpRequest
 * (the way Expo's Firebase guide does it): `fetch(file).blob()` is unreliable for local files on
 * Android. Storage rules: images only, under 10 MB, in the user's own folder.
 */
export async function uploadProfilePhoto(uid: string, localUri: string, mimeType = 'image/jpeg'): Promise<string> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new Error('photo-unreadable'));
    xhr.responseType = 'blob';
    xhr.open('GET', localUri, true);
    xhr.send(null);
  });
  try {
    const type = /^image\/(jpeg|png|webp|heic|heif)$/.test(mimeType) ? mimeType : 'image/jpeg';
    const r = ref(storage, `profilePhotos/${uid}/${Date.now()}.${type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'}`);
    await uploadBytes(r, blob, { contentType: type });
    return await getDownloadURL(r);
  } finally {
    (blob as Blob & { close?: () => void }).close?.();
  }
}

/**
 * Makes the profile document of a signed-in account that has none (an account made in the
 * Firebase console, or a sign-up interrupted before its profile was saved), so favourites and
 * trips can be saved. The username comes from the e-mail address (a number is added if taken).
 */
export async function ensureProfile(uid: string, email: string, displayName: string, lang: Lang): Promise<void> {
  const base = (email.split('@')[0] || 'traveller').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20) || 'traveller';
  for (let attempt = 0; attempt < 4; attempt++) {
    const handle = attempt === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    try {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', uid);
        if ((await tx.get(userRef)).exists()) return;
        const nameRef = doc(db, 'usernames', handle);
        if ((await tx.get(nameRef)).exists()) throw new UserNameTakenError();
        tx.set(nameRef, { uid });
        const name = displayName.trim() || handle;
        const user: UserDoc = {
          ...normalizeUser({}, uid),
          userName: handle,
          searchKeys: buildSearchKeys(handle, name),
          name,
          language: lang,
          createdAt: Date.now(),
        };
        tx.set(userRef, user);
      });
      return;
    } catch (e) {
      if (!(e instanceof UserNameTakenError)) throw e;
    }
  }
}

/** A short code for an error, shown after "Something went wrong" so a screenshot says what failed. */
export function errorCode(e: unknown): string {
  const x = e as { code?: string; message?: string } | null;
  return String(x?.code ?? x?.message ?? e ?? '')
    .replace(/^(firestore|storage|functions|auth)\//, '')
    .slice(0, 60);
}

export async function getUser(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data() as UserDoc) : null;
}
