import { Trip } from '../models';
import { getTrip } from './tripService';

/**
 * In-memory home for trips being viewed or edited, so screens pass only an id.
 * Freshly generated (unsaved) trips live here until the user saves them.
 */
const trips = new Map<string, Trip>();
const saved = new Set<string>();

/** True once the trip exists in Firestore (loaded from there or saved by the user). */
export const isSaved = (id: string) => saved.has(id);
export const markSaved = (id: string) => void saved.add(id);
const listeners = new Set<(id: string) => void>();

export function putTrip(trip: Trip): string {
  const id = String(trip.id);
  trips.set(id, trip);
  listeners.forEach((l) => l(id));
  return id;
}

export function peekTrip(id: string): Trip | undefined {
  return trips.get(id);
}

export async function loadTrip(id: string): Promise<Trip | null> {
  const local = trips.get(id);
  if (local) return local;
  const remote = await getTrip(id).catch(() => null);
  if (remote) {
    trips.set(id, remote);
    saved.add(id);
  }
  return remote;
}

export function onTripChange(cb: (id: string) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
