import type { ExpoConfig } from 'expo/config';
import { withGradleProperties } from 'expo/config-plugins';

/**
 * Gives Gradle more memory. With the default (2 GB, 512 MB metaspace) release builds of this many
 * native libraries stop in the lint step with "Metaspace". Applied whenever the android folder is
 * generated; an existing android/gradle.properties is edited by hand (README → emulator section).
 */
const GRADLE_JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1024m';
function withGradleMemory(cfg: ExpoConfig): ExpoConfig {
  return withGradleProperties(cfg, (c: any) => {
    c.modResults = c.modResults.filter((p: any) => !(p.type === 'property' && p.key === 'org.gradle.jvmargs'));
    c.modResults.push({ type: 'property', key: 'org.gradle.jvmargs', value: GRADLE_JVM_ARGS });
    return c;
  });
}

/**
 * Expo app config. Secrets come from environment variables (see .env.example);
 * EAS Build injects them from the project's EAS secrets.
 *
 * Only two keys ever ship inside the APK:
 *  - the Google Maps Android SDK key (restrict it to this package + SHA-1 in Google Cloud)
 *  - the public Firebase web config
 * Every other key (TripAdvisor, Google Routes/Geocoding, Ticketmaster, PayPal, SMTP)
 * stays server-side in Cloud Functions secrets.
 */
const MAPS_KEY = (process.env.GOOGLE_MAPS_ANDROID_KEY ?? '').trim();

const config: ExpoConfig = {
  name: 'Firefly',
  slug: 'firefly',
  scheme: 'firefly',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#1B1B3A',
  },
  android: {
    package: 'net.differentroute.firefly',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#1B1B3A',
    },
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
  },
  plugins: [
    'expo-localization',
    'expo-web-browser',
    [
      'expo-location',
      { locationWhenInUsePermission: 'Firefly uses your location to show camps and events near you.' },
    ],
    [
      'expo-image-picker',
      { photosPermission: 'Firefly lets you choose a profile photo.' },
    ],
    ['expo-build-properties', { android: { minSdkVersion: 26 } }],
    // The Google Maps key goes into AndroidManifest.xml (com.google.android.geo.API_KEY) through
    // react-native-maps' own plugin — the way Expo SDK 57 supports. The old android.config.googleMaps
    // field is no longer applied, which left the key out and made the map crash ("API key not found").
    // Without a key the map screens show a notice instead of a map.
    ...(MAPS_KEY ? [['react-native-maps', { androidGoogleMapsApiKey: MAPS_KEY }] as [string, object]] : []),
  ],
  updates: { fallbackToCacheTimeout: 0 },
  extra: {
    // Hebrew is right-to-left; the app flips layout when the user picks it.
    supportsRTL: true,
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY ?? '',
      authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? '',
      projectId: process.env.FIREBASE_PROJECT_ID ?? '',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? '',
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID ?? '',
      appId: process.env.FIREBASE_APP_ID ?? '',
    },
    functionsRegion: process.env.FIREBASE_FUNCTIONS_REGION ?? 'europe-west1',
    // Contact shown in the app; bank-transfer bookings are emailed here by a Cloud Function.
    bookingsEmail: 'dubinanna@gmail.com',
    hasGoogleMapsKey: !!MAPS_KEY,
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
  },
};

export default withGradleMemory(config);
