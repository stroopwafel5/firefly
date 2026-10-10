import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInAnonymously, type User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import type { UserDoc } from '../models';
import { auth, db, serverConfigured } from '../services/firebase';
import { warmUp } from '../services/api';

interface AuthState {
  firebaseUser: FirebaseUser | null;
  profile: UserDoc | null;
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
  ready: false,
  isAdmin: false,
  entered: false,
  continueAsGuest: () => undefined,
  holdWhile: (work) => work(),
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
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
    return onAuthStateChanged(auth, async (u) => {
        setFirebaseUser(u);
        if (u) {
          warmUp(); // start the server functions while the user looks around (see api.ts)
          // Admins are marked with a custom claim (scripts/setAdmin.ts).
          const token = await u.getIdTokenResult().catch(() => null);
          // Ignore a late answer for someone who has logged out (or switched account) meanwhile.
          if (auth.currentUser?.uid === u.uid) setIsAdmin(token?.claims?.admin === true);
        } else {
          // Logged out (or never logged in): back to the log-in page.
          setIsAdmin(false);
          setProfile(null);
          if (!holdingRef.current) setGuest(false); // a failed sign-up doesn't end a guest visit
        }
        setReady(true);
      });
  }, []);

  useEffect(() => {
    if (!firebaseUser || !serverConfigured) return;
    return onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => setProfile(snap.exists() ? (snap.data() as UserDoc) : null),
      () => setProfile(null),
    );
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
    <AuthContext.Provider value={{ firebaseUser, profile, ready, isAdmin, entered, continueAsGuest, holdWhile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
