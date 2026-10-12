import { Location, MODE_CAR, ModeOfTravel } from '../models';

const R = 6371; // km

export function haversineKm(a: Location, b: Location): number {
  const dLat = rad(b.locLat - a.locLat);
  const dLon = rad(b.locLon - a.locLon);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.locLat)) * Math.cos(rad(b.locLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function rad(d: number) {
  return (d * Math.PI) / 180;
}

/**
 * Fallback travel time when the routing API has no answer (offline, quota, or no transit).
 * Deliberately conservative so the generated day still fits in real life.
 *  - Car: road distance ≈ 1.35 × straight line; 25 km/h in town, 50 up to 50 km, 85 beyond; +5 min parking.
 *  - Public transport: walk if under 1.2 km (4.5 km/h); otherwise 10 min waiting + 18 km/h in town,
 *    55 km/h for intercity trips.
 */
export function estimateTravelMinutes(km: number, mode: ModeOfTravel): number {
  if (km < 0.05) return 0;
  if (mode === MODE_CAR) {
    const road = km * 1.35;
    const speed = road < 10 ? 25 : road < 50 ? 50 : 85;
    return Math.ceil((road / speed) * 60 + 5);
  }
  if (km < 1.2) return Math.ceil(((km * 1.3) / 4.5) * 60);
  const speed = km < 40 ? 18 : 55;
  return Math.ceil(10 + ((km * 1.35) / speed) * 60);
}

/** Decodes a Google encoded polyline into locations. */
export function decodePolyline(encoded: string): Location[] {
  const points: Location[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const which of [0, 1]) {
      let result = 0;
      let shift = 0;
      let b: number;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    points.push(new Location(lat / 1e5, lng / 1e5));
  }
  return points;
}

/** The point at `fraction` (0..1) of the way along a path, measured by distance. */
export function pointAlong(path: Location[], fraction: number): Location {
  if (path.length === 0) throw new Error('empty path');
  if (path.length === 1 || fraction <= 0) return path[0];
  if (fraction >= 1) return path[path.length - 1];
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const d = haversineKm(path[i - 1], path[i]);
    seg.push(d);
    total += d;
  }
  let target = total * fraction;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i]) {
      const f = seg[i] === 0 ? 0 : target / seg[i];
      return interpolate(path[i], path[i + 1], f);
    }
    target -= seg[i];
  }
  return path[path.length - 1];
}

/** The point `km` away from `a` in the direction `bearingDeg` (0 = north, 90 = east). */
export function offsetKm(a: Location, km: number, bearingDeg: number): Location {
  const b = (bearingDeg * Math.PI) / 180;
  const dLat = (km * Math.cos(b)) / 111.32;
  const dLon = (km * Math.sin(b)) / (111.32 * Math.max(0.05, Math.cos((a.locLat * Math.PI) / 180)));
  return new Location(Math.max(-89.9, Math.min(89.9, a.locLat + dLat)), ((a.locLon + dLon + 540) % 360) - 180);
}

export function interpolate(a: Location, b: Location, f: number): Location {
  return new Location(a.locLat + (b.locLat - a.locLat) * f, a.locLon + (b.locLon - a.locLon) * f);
}

/**
 * Where each day of the trip is based.
 *  - Round trip (start and end within 30 km): every day is based at the start city.
 *  - One-way trip: day i is based at fraction i/(n-1) along the road route (or the straight line
 *    if no route is known), so the first day is in the start city and the last in the end city.
 */
export function dayAnchors(start: Location, end: Location, numDays: number, route: Location[] | null): Location[] {
  if (numDays <= 0) return [];
  if (haversineKm(start, end) < 30) return Array.from({ length: numDays }, () => start);
  const path = route && route.length >= 2 ? route : [start, end];
  return Array.from({ length: numDays }, (_, i) => pointAlong(path, numDays === 1 ? 0 : i / (numDays - 1)));
}
