import Constants from 'expo-constants';

interface Extra {
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  functionsRegion: string;
  bookingsEmail: string;
  hasGoogleMapsKey: boolean;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<Extra>;

export const config = {
  firebase: extra.firebase ?? {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },
  functionsRegion: extra.functionsRegion ?? 'europe-west1',
  bookingsEmail: extra.bookingsEmail ?? 'dubinanna@gmail.com',
  /** Wikimedia asks API clients to identify themselves. */
  wikiUserAgent: 'FireflyTravelApp/1.0 (Different Route; https://www.differentroute.net) react-native',
  /** Default "near me" radius for the Weekend tab when no place is typed. */
  defaultEventRadiusKm: 100,
  /** False until a Firebase project is set in .env: the app then runs on its built-in content. */
  get firebaseConfigured(): boolean {
    const f = this.firebase;
    return !!(f.apiKey && f.projectId && f.appId) || this.useEmulators;
  },
  /** False until GOOGLE_MAPS_ANDROID_KEY is set: map screens show a notice instead of a map. */
  hasGoogleMapsKey: extra.hasGoogleMapsKey === true,
  /** When set (EXPO_PUBLIC_USE_EMULATORS=1), the app talks to the local Firebase emulators. */
  useEmulators: process.env.EXPO_PUBLIC_USE_EMULATORS === '1',
  emulatorHost: process.env.EXPO_PUBLIC_EMULATOR_HOST ?? '10.0.2.2',
};
