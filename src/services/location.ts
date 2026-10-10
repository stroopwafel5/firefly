import * as ExpoLocation from 'expo-location';
import { Location } from '../models';

let last: Location | null = null;

const toLocation = (p: { coords: { latitude: number; longitude: number } }) => new Location(p.coords.latitude, p.coords.longitude);

/**
 * Current position, or null if the user declines or no fix arrives within `timeoutMs`.
 * Cached for the session. A fresh GPS fix can take a long time (on an emulator with no location
 * set it never comes), so screens never wait longer than the timeout; a fix that arrives later
 * is still remembered for the next call.
 */
export async function currentLocation(timeoutMs = 6_000): Promise<Location | null> {
  if (last) return last;
  try {
    const perm = await ExpoLocation.requestForegroundPermissionsAsync(); // waits for the user's answer
    if (perm.status !== 'granted') return null;
    // A recent fix only: an old one could be in another city, and it's kept for the session.
    const known = await ExpoLocation.getLastKnownPositionAsync({ maxAge: 15 * 60_000, requiredAccuracy: 2_000 }).catch(() => null);
    if (known) return (last = toLocation(known));
    const fix = ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced })
      .then((p) => (last = toLocation(p)))
      .catch(() => null);
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
    return await Promise.race([fix, timeout]);
  } catch {
    return null;
  }
}
