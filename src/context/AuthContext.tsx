import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInAnonymously, type User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import type { UserDoc } from '../models';
import { auth, db, serverConfigured } from '../services/firebase';
import { warmUp } from '../services/api';
import { ensureProfile, normalizeUser } from '../services/userService';

interface AuthState {
  firebaseUser: FirebaseUser | null;
  profile: UserDoc | null;
  /** The profile as the server has it (no change of this phone still on its way). */
  profileConfirmed: boolean;
  ready: boolean;
  isAdmin: boolean;
  /**
   * True once the person is past the log-in page: logged in with an account, or chose
   * "Continue as guest" in this session. Guests see the log-in page again next time the app
   * starts; account holders go straight to the start screen.
   */
  entered: boolean;
  continueAsGuest: () => void;
  /**
   * Runs a sign-up while holding the log-in page in place. Creating an account signs the new
   * user in before their profile is saved; if saving then fails (username taken) the account is
   * removed again. Without the hold, the app would open and close around that.
   */
  holdWhile: <T>(work: () => Promise<T>) => Promise<T>;
}

const AuthContext = createContext<AuthState>({
  firebaseUser: null,
  profile: null,
  profileConfirmed: false,
  ready: false,
  isAdmin: false,
  entered: false,
  continueAsGuest: () => undefined,
  holdWhile: (work) => work(),
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [profileConfirmed, setProfileConfirmed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [ready, setReady] = useState(false);
  const [guest, setGuest] = useState(false);
  const [holding, setHolding] = useState(false);
  const holdingRef = useRef(false);

  useEffect(() => {
    if (!serverConfigured) {
      setReady(true); // built-in content only: browsing works, signing in doesn't
      return;
    }
    // Firebase normally answers at once (it reads the saved session from the phone). If it hasn't
    // after 8 seconds (storage busy, a broken saved session), show the log-in page anyway rather
    // than a spinner forever; a late answer still signs the user in.
    const giveUp = setTimeout(() => setReady(true), 8000);
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
        clearTimeout(giveUp);
        setFirebaseUser(u);
        if (!u) {
          // Logged out (or never logged in): back to the log-in page.
          setIsAdmin(false);
          setProfile(null);
          if (!holdingRef.current) setGuest(false); // a failed sign-up doesn't end a guest visit
        }
        // Open the app now; the admin check below may need the network (an expired session is
        // refreshed first), and nothing on screen should wait for it.
        setReady(true);
        if (u) {
          warmUp(); // start the server functions while the user looks around (see api.ts)
          // Admins are marked with a custom claim (scripts/setAdmin.ts).
          const token = await u.getIdTokenResult().catch(() => null);
          // Ignore a late answer for someone who has logged out (or switched account) meanwhile.
          if (auth.currentUser?.uid === u.uid) setIsAdmin(token?.claims?.admin === true);
        }
      });
    return () => {
      clearTimeout(giveUp);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!firebaseUser || !serverConfigured) return;
    let repair: ReturnType<typeof setTimeout> | undefined;
    const off = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        // Every list present, even in profiles saved by earlier versions (normalizeUser).
        setProfile(snap.exists() ? normalizeUser(snap.data() as Partial<UserDoc>, firebaseUser.uid) : null);
        setProfileConfirmed(!snap.metadata.hasPendingWrites && !snap.metadata.fromCache);
        clearTimeout(repair);
        // An account without a profile (made in the console, or a sign-up cut short): make one,
        // unless a sign-up is saving it right now.
        if (!snap.exists() && !firebaseUser.isAnonymous) {
          repair = setTimeout(() => {
            if (holdingRef.current || auth.currentUser?.uid !== firebaseUser.uid) return;
            ensureProfile(firebaseUser.uid, firebaseUser.email ?? '', firebaseUser.displayName ?? '', 'en').catch(() => undefined);
          }, 5000);
        }
      },
      () => setProfile(null),
    );
    return () => {
      clearTimeout(repair);
      off();
    };
  }, [firebaseUser]);

  const continueAsGuest = useCallback(() => {
    setGuest(true);
    // Guests browse with an anonymous session so the Cloud Functions (which require auth to
    // protect API quotas) work before anyone creates an account.
    if (serverConfigured && !auth.currentUser) signInAnonymously(auth).catch(() => undefined);
  }, []);

  const holdWhile = useCallback(async <T,>(work: () => Promise<T>): Promise<T> => {
    holdingRef.current = true;
    setHolding(true);
    try {
      return await work();
    } finally {
      holdingRef.current = false;
      setHolding(false);
    }
  }, []);

  const entered = guest || (!!firebaseUser && !firebaseUser.isAnonymous && !holding);

  return (
    <AuthContext.Provider value={{ firebaseUser, profile, profileConfirmed, ready, isAdmin, entered, continueAsGuest, holdWhile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
