import React, { createContext, useContext, useMemo } from 'react';
import { colors, mix } from '../theme';

/**
 * Each section has its own light tint instead of plain white: light orange for Camps, light
 * purple for Events, light green for Trips (pink for the kids' plan, lavender elsewhere).
 *   page    – the screen behind everything (lightest)
 *   surface – fold-out panels and cards
 *   strong  – a panel while pressed or open, selected rows
 *   field   – text boxes, date fields and the signature pad: between page and panel, so they stay
 *             clearly tinted wherever they sit (never white)
 *   line    – borders and dividers
 *   muted   – secondary text in the section's colour (never grey)
 */
export interface Tint {
  accent: string;
  page: string;
  surface: string;
  strong: string;
  field: string;
  line: string;
  muted: string;
}

const TUNED: Record<string, Omit<Tint, 'accent'>> = {
  [colors.camps]: { page: '#FFF4EA', surface: '#FFE6CF', strong: '#FFD9B5', field: '#FFEEDF', line: '#F6C9A0', muted: '#9A4A0C' },
  [colors.weekend]: { page: '#F8F1FC', surface: '#EEDDF7', strong: '#E4CCF2', field: '#F3E8FA', line: '#D9BCEB', muted: '#5E3A7E' },
  [colors.planner]: { page: '#EEF8F5', surface: '#D8F0E9', strong: '#C6E8DE', field: '#E5F5F0', line: '#AEDBCF', muted: '#22675A' },
  [colors.kids]: { page: '#FFF2F7', surface: '#FCE0EC', strong: '#F8CFE0', field: '#FEEAF2', line: '#F3B9D1', muted: '#9C2B5E' },
  [colors.night]: { page: '#F3F2FA', surface: '#E7E5F3', strong: '#DCD9EE', field: '#EEECF7', line: '#D2CFE6', muted: '#4E4A86' },
};

export function tintFor(accent: string): Tint {
  const tuned = TUNED[accent];
  if (tuned) return { accent, ...tuned };
  const w = '#FFFFFF';
  return { accent, page: mix(accent, w, 0.95), surface: mix(accent, w, 0.86), strong: mix(accent, w, 0.78), field: mix(accent, w, 0.91), line: mix(accent, w, 0.7), muted: mix(accent, '#1B1B3A', 0.35) };
}

const TintContext = createContext<Tint>(tintFor(colors.night));

export function TintProvider({ accent, children }: { accent: string; children: React.ReactNode }) {
  const value = useMemo(() => tintFor(accent), [accent]);
  return <TintContext.Provider value={value}>{children}</TintContext.Provider>;
}

/** The tint of the section this component is in (from the nearest Screen). */
export function useTint(): Tint {
  return useContext(TintContext);
}
