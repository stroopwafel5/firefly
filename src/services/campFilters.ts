import { type Camp, supportsAll } from '../models';

/** Filters for the Camps list (no Firebase here, so the tests can run it). */
export interface CampFilter {
  name: string;
  startsAfter?: Date;
  endsBefore?: Date;
  age?: number;
  country?: string;
  minPrice?: number;
  maxPrice?: number;
  /** Only camps that support every one of these needs. */
  needs?: string[];
  provider?: string;
}

/** The providers in a list of camps (Different Route first). */
export function providersOf(camps: Camp[]): string[] {
  return [...new Set(camps.map((c) => c.provider))].sort((a, b) => (a === 'Differentroute' ? -1 : b === 'Differentroute' ? 1 : a.localeCompare(b)));
}

export function filterCamps(camps: Camp[], f: CampFilter): Camp[] {
  const q = f.name.trim().toLowerCase();
  return camps.filter(
    (c) =>
      (!q || c.name.toLowerCase().includes(q) || c.locationName.toLowerCase().includes(q)) &&
      (!f.startsAfter || c.startDate >= f.startsAfter) &&
      (!f.endsBefore || c.endDate <= f.endsBefore) &&
      (f.age == null || c.acceptsAge(f.age)) &&
      (!f.country || c.country === f.country) &&
      (f.minPrice == null || c.price >= f.minPrice) &&
      (f.maxPrice == null || c.price <= f.maxPrice) &&
      (!f.needs?.length || supportsAll(c.disability, f.needs)) &&
      (!f.provider || c.provider === f.provider),
  );
}
