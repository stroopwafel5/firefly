import React, { createContext, useContext } from 'react';
import { Text as RNText, TextInput as RNTextInput } from 'react-native';
import type { TextInputProps, TextProps } from 'react-native';
import { FontFace, withAppFont } from '../fonts';
import { colors } from '../theme';
import { useTint } from './Tint';

/**
 * Which typeface the app is in (Inter for English, Rubik for Hebrew and Russian — see fonts.ts).
 * Set by I18nProvider; every Text reads it, so switching language re-fonts the whole app at once.
 */
export const FontFaceContext = createContext<FontFace>('inter');

/** React Native's Text and TextInput, in Firefly's typeface (see fonts.ts). Use these everywhere. */
export const Text = React.forwardRef<React.ComponentRef<typeof RNText>, TextProps>(function Text({ style, ...rest }, ref) {
  const face = useContext(FontFaceContext);
  const tint = useTint();
  return <RNText ref={ref} {...rest} style={withAppFont(style, face, tint.muted)} />;
});

export const TextInput = React.forwardRef<React.ComponentRef<typeof RNTextInput>, TextInputProps>(function TextInput(
  { style, placeholderTextColor, ...rest },
  ref,
) {
  const face = useContext(FontFaceContext);
  const tint = useTint();
  const placeholder = !placeholderTextColor || placeholderTextColor === colors.muted ? tint.muted : placeholderTextColor;
  return <RNTextInput ref={ref} {...rest} placeholderTextColor={placeholder} style={withAppFont(style, face, tint.muted)} />;
});
