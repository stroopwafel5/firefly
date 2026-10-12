/**
 * Shared value types used by every model.
 *
 * Spec deviations (documented in README):
 *  - Location uses floating-point lat/lon. Integer degrees (as in the spec) would put a pin
 *    up to ~111 km away from the real place.
 *  - Every photo carries a PhotoSource (where it was published and who took it) so each
 *    image in the app is verifiable. `photos: string[]` is kept exactly as specified and
 *    `photoSources[i]` describes `photos[i]`.
 */

export class Location {
  constructor(
    public locLat: number,
    public locLon: number,
  ) {}

  static from(obj: { locLat: number; locLon: number } | { lat: number; lon: number }): Location {
    if ('locLat' in obj) return new Location(obj.locLat, obj.locLon);
    return new Location(obj.lat, obj.lon);
  }

  toJSON() {
    return { locLat: this.locLat, locLon: this.locLon };
  }

  isValid(): boolean {
    return (
      Number.isFinite(this.locLat) &&
      Number.isFinite(this.locLon) &&
      Math.abs(this.locLat) <= 90 &&
      Math.abs(this.locLon) <= 180 &&
      !(this.locLat === 0 && this.locLon === 0)
    );
  }
}

/** Where a photo comes from. `sourcePage` must be a public page that shows the photo. */
export interface PhotoSource {
  url: string;
  sourcePage: string;
  credit: string;
  license?: string;
}

/** "HH:MM", 24h clock. Hours 24–25 mean after midnight (the planner's day may end at 01:00). */
export type Time = string;

/** Weekday opening intervals in minutes after midnight. Index 0 = Sunday … 6 = Saturday. */
export type WeeklyHours = Array<Array<{ open: number; close: number }>>;

/** Event / trip interest types, exactly as in the spec. */
export const EVENT_TYPES = [
  'Family',
  'Nature',
  'History',
  'Theatre',
  'Festival',
  'Food',
  'Tour',
  'Kid Friendly',
  'Shopping',
  'Beaches',
  'Extreme Sport',
  'Night Clubs',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

/** 0 = car, 1 = public transport (spec: int ModeOfTravel). */
export const MODE_CAR = 0 as const;
export const MODE_PUBLIC_TRANSPORT = 1 as const;
export type ModeOfTravel = typeof MODE_CAR | typeof MODE_PUBLIC_TRANSPORT;

export function toDate(value: Date | string | number | { toDate(): Date }): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value && 'toDate' in value) return value.toDate();
  return new Date(value);
}

/** YYYY-MM-DD in local time. */
export function isoDay(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
