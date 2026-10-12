/** Firefly palette. Each section has its own accent, as the spec asks. */
export const colors = {
  night: '#1B1B3A',
  firefly: '#FFC93C',
  fireflySoft: '#FFF6DB',
  text: '#26263A', // a soft ink rather than black: calmer on the eye
  /** Secondary text and icons: a soft indigo, never grey (text takes its section's shade — Tint.tsx). */
  muted: '#4E4A86',
  line: '#E6E4EE',
  bg: '#F7F6FB',
  card: '#FFFFFF',
  danger: '#C62828',
  success: '#2E7D32',

  camps: '#EF6C00', // orange
  campsSoft: '#FFF1E2',
  weekend: '#6A1B9A', // purple
  weekendSoft: '#F4E8FA',
  planner: '#00796B', // teal
  plannerSoft: '#E1F3F0',
  kids: '#D81B60', // pink
  kidsSoft: '#FDE7F0',
  event: '#7B1FA2',
  restaurant: '#5D4037',
  hotel: '#1565C0',
  /** Attractions and the day titles on a trip plan: dark green. */
  attraction: '#1B5E20',
  attractionSoft: '#E3F1E4',
};

/** One colour per trip type (type tiles, badges): never grey. */
export const typeColors: Record<
  'Family' | 'Nature' | 'History' | 'Theatre' | 'Festival' | 'Food' | 'Tour' | 'Kid Friendly' | 'Shopping' | 'Beaches' | 'Extreme Sport' | 'Night Clubs',
  string
> = {
  Nature: '#2E7D32',
  History: '#8D4E1F',
  Theatre: '#AD1457',
  Festival: '#6A1B9A',
  Food: '#E65100',
  Tour: '#1565C0',
  Family: '#00838F',
  'Kid Friendly': '#D81B60',
  Shopping: '#C2185B',
  Beaches: '#0277BD',
  'Extreme Sport': '#BF360C',
  'Night Clubs': '#4527A0',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };
/** Type scale: generous sizes and line spacing, medium weights — clear without shouting. */
export const font = {
  title: { fontSize: 26, fontWeight: '700' as const, color: colors.text },
  h2: { fontSize: 20, fontWeight: '600' as const, color: colors.text },
  h3: { fontSize: 17, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 16, color: colors.text, lineHeight: 24 },
  small: { fontSize: 14, color: colors.muted, lineHeight: 20 },
};

export type Accent = 'camps' | 'weekend' | 'planner' | 'kids';
export const accentColor = (a: Accent) => colors[a];
export const accentSoft = (a: Accent) => colors[`${a}Soft` as const];

/** Blend two #RRGGBB colours: t = 0 gives `a`, t = 1 gives `b`. */
export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** Section colours lifted so they glow on the dark (night) surfaces: start screen and tab bar. */
export const glowAccent = {
  camps: '#FF9A3D',
  weekend: '#C77DFF',
  planner: '#2EC4B6',
  kids: '#FF6FA3',
  account: '#FFC93C',
};
