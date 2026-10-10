/**
 * TripAdvisor's nearby search returns only the ~10 places closest to the point you give it.
 * A long stay in one city needs more than that, so we also search from points on rings
 * around the centre and merge the results. Pure (no Firebase), so it is unit-tested.
 */

/** Points to search from: the centre, then 4 points 3 km out, then 6 points 8 km out. */
export function searchPoints(lat: number, lon: number, want: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [[lat, lon]];
  const ring = (km: number, n: number, phase: number) => {
    const kmPerDegLon = 111.32 * Math.max(0.1, Math.cos((lat * Math.PI) / 180));
    for (let k = 0; k < n; k++) {
      const angle = phase + (2 * Math.PI * k) / n;
      pts.push([lat + (km / 111.32) * Math.cos(angle), lon + (km / kmPerDegLon) * Math.sin(angle)]);
    }
  };
  if (want > 10) ring(3, 4, 0);
  if (want > 24) ring(8, 6, Math.PI / 6);
  return pts;
}

/**
 * Merges several result lists, taking one from each list in turn so every area is
 * represented, skipping duplicates, and stopping at `want` items.
 */
export function mergeRoundRobin<T>(lists: T[][], key: (t: T) => string, want: number): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < want && lists.some((l) => i < l.length); i++) {
    for (const l of lists) {
      const item = l[i];
      if (item === undefined) continue;
      const k = key(item);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(item);
      if (out.length >= want) break;
    }
  }
  return out;
}
