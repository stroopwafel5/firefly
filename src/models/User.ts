import type { Camp } from './Camp';
import type { Event } from './Event';
import type { Attraction, Trip } from './Trip';

/**
 * Spec: User (id, userName, name, description, dateOfBirth, photo, bookedCamps,
 * favouriteCamps, bookedEvents, favouriteEvents, myTrips, favouriteAttraction, friends).
 *
 * In Firestore a user document stores ids (UserDoc); screens hydrate them into this class.
 * `id` is the Firebase Auth uid (a string), exposed as `uid`.
 */
export class User {
  constructor(
    public uid: string,
    public userName: string,
    public name: string,
    public description: string,
    public dateOfBirth: Date | null,
    public photo: string,
    public bookedCamps: Camp[] = [],
    public favouriteCamps: Camp[] = [],
    public bookedEvents: Event[] = [],
    public favouriteEvents: Event[] = [],
    public myTrips: Trip[] = [],
    public favouriteAttraction: Attraction[] = [],
    public friends: User[] = [],
  ) {}

  get id(): string {
    return this.uid;
  }
}

/** What is actually stored at users/{uid}. */
export interface UserDoc {
  uid: string;
  userName: string;
  /** lowercase copy of userName + name for prefix search */
  searchKeys: string[];
  name: string;
  description: string;
  dateOfBirth: string | null;
  photo: string;
  bookedCamps: number[];
  favouriteCamps: number[];
  bookedEvents: string[];
  favouriteEvents: string[];
  myTrips: string[];
  favouriteAttraction: string[];
  friends: string[];
  language: 'en' | 'he' | 'ru';
  isAdmin?: boolean;
  createdAt: number;
}

export function buildSearchKeys(userName: string, name: string): string[] {
  const words = `${userName} ${name}`
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const keys = new Set<string>();
  for (const w of words) {
    for (let i = 1; i <= Math.min(w.length, 20); i++) keys.add(w.slice(0, i));
  }
  return [...keys];
}
