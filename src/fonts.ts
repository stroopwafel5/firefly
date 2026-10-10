import { StyleSheet } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { colors } from './theme';

/**
 * Firefly's typefaces:
 *  - English: Inter — clean, modern and very legible on phone screens.
 *  - Hebrew and Russian: Rubik — soft and rounded, drawn for Hebrew and Cyrillic (Inter has no
 *    Hebrew letters). Any Hebrew name that turns up in the English app is drawn by the phone's
 *    own Hebrew font automatically.
 * Each weight is its own font file, so the family is chosen from the style's fontWeight (and
 * fontWeight reset, which stops Android from thickening an already-bold file). Until the fonts
 * have loaded, or if they ever fail to load, text simply uses the phone's own font.
 */
export type FontFace = 'inter' | 'rubik';

const RUBIK: Record<string, string> = {
  '100': 'Rubik_300Light',
  '200': 'Rubik_300Light',
  '300': 'Rubik_300Light',
  '400': 'Rubik_400Regular',
  normal: 'Rubik_400Regular',
  '500': 'Rubik_500Medium',
  '600': 'Rubik_600SemiBold',
  '700': 'Rubik_700Bold',
  bold: 'Rubik_700Bold',
  '800': 'Rubik_800ExtraBold',
  '900': 'Rubik_800ExtraBold',
};

const INTER: Record<string, string> = {
  '100': 'Inter_300Light',
  '200': 'Inter_300Light',
  '300': 'Inter_300Light',
  '400': 'Inter_400Regular',
  normal: 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  bold: 'Inter_700Bold',
  '800': 'Inter_800ExtraBold',
  '900': 'Inter_800ExtraBold',
};

const FAMILIES: Record<FontFace, Record<string, string>> = { inter: INTER, rubik: RUBIK };

/** English → Inter; Hebrew and Russian → Rubik. */
export function faceForLang(lang: string): FontFace {
  return lang === 'en' ? 'inter' : 'rubik';
}

let ready = false;
export function setFontsReady(v: boolean) {
  ready = v;
}

/**
 * The app's font for a text style, and — when `muted` is given — the section's own shade for
 * secondary text (the old grey `colors.muted` becomes dark orange in Camps, plum in Events…).
 */
export function withAppFont(style: StyleProp<TextStyle>, face: FontFace = 'inter', muted?: string): StyleProp<TextStyle> {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const recolor = muted && flat.color === colors.muted ? { color: muted } : null;
  if (!ready || flat.fontFamily) return recolor ? [style, recolor] : style; // a style that picks its own font keeps it
  const map = FAMILIES[face];
  const family = map[String(flat.fontWeight ?? '400')] ?? map['400'];
  // Inter is spaced for body text; big titles look tidier pulled in slightly (as Inter's designer advises).
  const size = flat.fontSize ?? 14;
  const tighten = face === 'inter' && size >= 20 && flat.letterSpacing == null;
  return [style, tighten ? { fontFamily: family, fontWeight: 'normal', letterSpacing: -Math.round(size * 0.02 * 10) / 10 } : { fontFamily: family, fontWeight: 'normal' }, recolor];
}
