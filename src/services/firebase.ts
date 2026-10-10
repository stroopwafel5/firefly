import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import { connectAuthEmulator, getAuth, initializeAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';
import { config } from '../config';

/**
 * Firebase throws during start-up when its settings are empty (no project yet), which would
 * leave a blank screen. Without a project the app starts on harmless placeholder settings,
 * `serverConfigured` is false, and the services skip the server and use built-in content.
 */
export const serverConfigured = config.firebaseConfigured;
const PLACEHOLDER = {
  apiKey: 'firefly-not-configured',
  authDomain: 'firefly-not-configured.firebaseapp.com',
  projectId: 'firefly-not-configured',
  storageBucket: 'firefly-not-configured.appspot.com',
  messagingSenderId: '0',
  appId: '1:0:web:0',
};
export const app = getApps().length ? getApp() : initializeApp(serverConfigured ? config.firebase : PLACEHOLDER);

/**
 * React Native auth persistence. `getReactNativePersistence` is exported from the
 * React Native build of firebase/auth; it is looked up dynamically because the web
 * typings do not declare it.
 */
function createAuth(): Auth {
  const rnPersistence = (FirebaseAuth as unknown as {
    getReactNativePersistence?: (storage: typeof AsyncStorage) => FirebaseAuth.Persistence;
  }).getReactNativePersistence;
  try {
    return initializeAuth(app, rnPersistence ? { persistence: rnPersistence(AsyncStorage) } : {});
  } catch {
    return getAuth(app); // already initialised (fast refresh)
  }
}

export const auth: Auth = createAuth();
// Long polling is more reliable than WebChannel streaming on Android networks.
export const db: Firestore = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
export const functions: Functions = getFunctions(app, config.functionsRegion);
export const storage: FirebaseStorage = getStorage(app);

if (config.useEmulators) {
  const host = config.emulatorHost;
  try {
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    connectFunctionsEmulator(functions, host, 5001);
    connectStorageEmulator(storage, host, 9199);
  } catch {
    /* already connected */
  }
}
