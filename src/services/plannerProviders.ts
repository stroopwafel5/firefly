import { Attraction, Event, Hotel, Location, Restaurant, isoDay } from '../models';
import type { PlannerProviders } from '../planner/generator';
import { api } from './api';
import { searchEvents } from './eventService';
import { kidContent } from './wikipedia';

const ll = (l: Location) => ({ lat: l.locLat, lon: l.locLon });

/** What the sources said while the current trip was planned (reset at the start of each plan). */
const notes = new Set<string>();
export function resetSourceNotes() {
  notes.clear();
}
const noteTripadvisor = (state?: string) => {
  if (state === 'busy' || state === 'error') notes.add('tripadvisorBusy');
};

/** The planner's data sources in the app: our Cloud Functions + Wikipedia. */
export const appProviders: PlannerProviders = {
  async geocode(query, lang) {
    const r = await api.geocode({ query, lang });
    return r ? { location: new Location(r.lat, r.lon), name: r.name, country: r.country } : null;
  },
  async route(a, b) {
    const r = await api.routeLine({ from: ll(a), to: ll(b) });
    return r ? r.points.map(([lat, lon]) => new Location(lat, lon)) : null;
  },
  async placeName(loc, lang) {
    return (await api.reverseGeocode({ ...ll(loc), lang })).name;
  },
  async attractionsNear(loc, lang, radiusKm, want, needs, opts) {
    const r = needs?.length
      ? await api.attractionsNearAccessible({ ...ll(loc), lang, radiusKm, want, needs })
      : await api.attractionsNear({ ...ll(loc), lang, radiusKm, want, landmarks: opts?.landmarks || undefined });
    if (!opts?.landmarks) noteTripadvisor(r.tripadvisor);
    return r.items.map(Attraction.fromJSON);
  },
  async restaurantsNear(loc, lang, want) {
    const r = await api.restaurantsNear({ ...ll(loc), lang, want });
    noteTripadvisor(r.tripadvisor);
    return r.items.map(Restaurant.fromJSON);
  },
  async hotelsNear(loc, lang, stay) {
    const r = await api.hotelsNear({
      ...ll(loc),
      lang,
      checkIn: isoDay(stay.checkIn),
      checkOut: isoDay(stay.checkOut),
      adults: stay.adults,
      kids: stay.kids,
    });
    return r.items.map(Hotel.fromJSON);
  },
  async eventsNear(loc, from, to, lang, radiusKm): Promise<Event[]> {
    const r = await searchEvents({ center: loc, radiusKm, from, to, lang });
    return r.events;
  },
  async travelMatrix(points, mode, departure) {
    const r = await api.travelMatrix({
      points: points.map((p) => ({ id: p.id, ...ll(p.location) })),
      mode,
      departure: departure && departure.getTime() > Date.now() ? departure.toISOString() : undefined,
    });
    return r.entries;
  },
  kidContent,
  sourceNotes: () => [...notes],
};
