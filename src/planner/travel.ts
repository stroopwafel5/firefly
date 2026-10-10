import { Location, ModeOfTravel, TravelLeg } from '../models';
import { estimateTravelMinutes, haversineKm } from './geo';

/**
 * Travel times between the points of one day, filled from the Google Routes API matrix and
 * stored with the DayPlan so drag & drop can re-time the day instantly (no network).
 * Pairs that were never fetched fall back to a conservative straight-line estimate,
 * flagged `estimated: true` so the UI can show "(estimate)".
 */
export class TravelTable {
  private entries: Map<string, [number, number]>;

  constructor(
    public mode: ModeOfTravel,
    entries?: Record<string, [number, number]>,
  ) {
    this.entries = new Map(Object.entries(entries ?? {}));
  }

  static key(fromId: string, toId: string) {
    return `${fromId}>${toId}`;
  }

  set(fromId: string, toId: string, minutes: number, meters: number) {
    this.entries.set(TravelTable.key(fromId, toId), [Math.max(0, Math.round(minutes)), Math.round(meters)]);
  }

  has(fromId: string, toId: string) {
    return this.entries.has(TravelTable.key(fromId, toId));
  }

  leg(fromId: string, from: Location, toId: string, to: Location): TravelLeg {
    if (fromId === toId) return { minutes: 0, distanceMeters: 0, mode: this.mode, estimated: false };
    const hit = this.entries.get(TravelTable.key(fromId, toId));
    if (hit) return { minutes: hit[0], distanceMeters: hit[1], mode: this.mode, estimated: false };
    const km = haversineKm(from, to);
    return {
      minutes: estimateTravelMinutes(km, this.mode),
      distanceMeters: Math.round(km * 1000 * 1.35),
      mode: this.mode,
      estimated: true,
    };
  }

  toJSON(): Record<string, [number, number]> {
    return Object.fromEntries(this.entries);
  }
}
