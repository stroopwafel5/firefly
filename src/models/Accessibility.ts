/**
 * Accessibility needs Firefly plans around. Each need is separate: support for one (say, a quiet
 * room for autistic visitors) is never taken as support for another (say, audio description for
 * blind visitors).
 *
 *  - Camps carry `disability: string[]` — the needs a camp's staff and programme support.
 *  - Attractions carry `disabilityCompatible: string[]` — needs a verifiable source confirms,
 *    with the sources in `accessibilitySources`.
 */
export const DISABILITIES = ['autism', 'adhd', 'hearing', 'blind', 'mentalHealth', 'physical', 'intellectual'] as const;
export type Disability = (typeof DISABILITIES)[number];

/**
 * Needs whose support at a venue can be checked against the venue's own website or a
 * disability / tourism organisation (audio description, hearing loops, sensory-friendly
 * provisions, step-free access…). The others shape the pace of the plan instead.
 */
export const VERIFIABLE_NEEDS: Disability[] = ['blind', 'hearing', 'autism', 'physical'];

export const isDisability = (v: unknown): v is Disability => typeof v === 'string' && (DISABILITIES as readonly string[]).includes(v);

/** Where a claim of support comes from. Shown in the app so people can check it themselves. */
export interface AccessibilitySource {
  need: Disability;
  /** The page that says so. */
  url: string;
  /**
   * 'venue' = the site's own website; 'organisation' = a disability or tourism body;
   * 'map' = OpenStreetMap's tags on the place (wheelchair=yes, tactile_paving=yes…).
   */
  by: 'venue' | 'organisation' | 'map';
  /** The organisation's name, for `by: 'organisation'` ("OpenStreetMap" for 'map'). */
  org?: string;
  /** The words found on the page (for 'venue'), or the map's tag (for 'map'). */
  phrase?: string;
  /** When it was last checked (ms). */
  checkedAt?: number;
}

/**
 * How a plan's pace changes for each need: fewer places a day and a quiet break after each
 * visit, so nobody is rushed. When several needs are chosen, the gentlest setting wins.
 */
export const PACING: Record<Disability, { maxPerDay: number; breakMinutes: number; maxVisitMinutes?: number }> = {
  autism: { maxPerDay: 3, breakMinutes: 30 },
  adhd: { maxPerDay: 4, breakMinutes: 20, maxVisitMinutes: 90 },
  hearing: { maxPerDay: 5, breakMinutes: 10 },
  blind: { maxPerDay: 4, breakMinutes: 15 },
  mentalHealth: { maxPerDay: 3, breakMinutes: 30 },
  physical: { maxPerDay: 4, breakMinutes: 20 },
  intellectual: { maxPerDay: 3, breakMinutes: 30 },
};

export function pacingFor(needs: readonly string[]): { maxPerDay?: number; breakMinutes: number; maxVisitMinutes?: number } {
  const chosen = needs.filter(isDisability).map((n) => PACING[n]);
  if (!chosen.length) return { breakMinutes: 0 };
  const caps = chosen.map((p) => p.maxVisitMinutes).filter((x): x is number => x != null);
  return {
    maxPerDay: Math.min(...chosen.map((p) => p.maxPerDay)),
    breakMinutes: Math.max(...chosen.map((p) => p.breakMinutes)),
    maxVisitMinutes: caps.length ? Math.min(...caps) : undefined,
  };
}

/** The camp supports every one of the chosen needs. */
export function supportsAll(supported: readonly string[], needs: readonly string[]): boolean {
  return needs.every((n) => supported.includes(n));
}
