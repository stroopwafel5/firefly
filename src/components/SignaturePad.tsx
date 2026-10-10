import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import Svg, { Path } from 'react-native-svg';
import { colors, radius, space } from '../theme';
import { useTint } from './Tint';
import { Button } from './ui';

/**
 * Finger signature, like the JotForm signature box. Produces SVG path data in a 600×200
 * coordinate space, which the booking e-mail attaches as signature.svg.
 */
export function SignaturePad({
  onChange,
  placeholder,
  clearLabel,
}: {
  onChange: (path: string) => void;
  placeholder: string;
  clearLabel: string;
}) {
  const tint = useTint();
  const [paths, setPaths] = useState<string[]>([]);
  const current = useRef('');
  const size = useRef({ w: 1, h: 1 });
  const [, force] = useState(0);

  const scale = (x: number, y: number) =>
    `${((x / size.current.w) * 600).toFixed(1)},${((y / size.current.h) * 200).toFixed(1)}`;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          current.current = `M${scale(e.nativeEvent.locationX, e.nativeEvent.locationY)}`;
          force((n) => n + 1);
        },
        onPanResponderMove: (e) => {
          current.current += ` L${scale(e.nativeEvent.locationX, e.nativeEvent.locationY)}`;
          force((n) => n + 1);
        },
        onPanResponderRelease: () => {
          setPaths((p) => {
            const next = [...p, current.current];
            onChange(next.join(' '));
            return next;
          });
          current.current = '';
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const all = [...paths, current.current].filter(Boolean);
  return (
    <View>
      <View
        style={[styles.pad, { backgroundColor: tint.field, borderColor: tint.line }]}
        onLayout={(e) => (size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        {...responder.panHandlers}
      >
        <Svg width="100%" height="100%" viewBox="0 0 600 200">
          {all.map((d, i) => (
            <Path key={i} d={d} stroke={colors.text} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
        {!all.length ? <Text style={styles.placeholder}>{placeholder}</Text> : null}
      </View>
      <Button
        small
        outline
        label={clearLabel}
        icon="eraser"
        onPress={() => {
          setPaths([]);
          onChange('');
        }}
        style={{ alignSelf: 'flex-end', marginTop: space.sm }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Signatures are drawn left-to-right even in Hebrew, so the pad never mirrors.
  pad: { height: 160, borderWidth: 1.5, borderRadius: radius.md, direction: 'ltr' },
  placeholder: { position: 'absolute', alignSelf: 'center', top: 68, color: colors.muted },
});
