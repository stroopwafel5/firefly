import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, I18nManager, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from './Text';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useI18n } from '../i18n';
import { colors, mix } from '../theme';

/**
 * Firefly's signature scene: dusk over a mountain ridge, a lit tent, a dotted trail and a few
 * fireflies glowing in the dark. Drawn as vectors, so it needs no images or network and stays
 * sharp on every phone. The front ridge is exactly the night colour, so whatever sits under the
 * scene continues the landscape.
 *
 * Drawn on a 400 × 320 canvas scaled to the screen width. `crop` cuts that many canvas units
 * off the top (the log-in pages use a shorter sky). Mirrored in Hebrew so the trail starts on
 * the reading side.
 */

export const SCENE_W = 400;
export const SCENE_H = 320;

export const dusk = {
  skyTop: '#0B0C26',
  skyMid: '#231F56',
  horizon: '#4A3478',
  ridgeFar: '#2E2B66',
  ridgeMid: '#25235A',
  ground: colors.night, // #1B1B3A — the screen below continues it
  glow: colors.firefly, // #FFC93C
  glowCore: '#FFF1B8',
  text: '#FFFFFF',
  textMuted: '#BDBBE0',
};

const STARS: Array<[number, number, number]> = [
  [40, 40, 1], [92, 22, 0.8], [150, 58, 1.1], [210, 30, 0.7], [265, 64, 1], [330, 26, 1.2],
  [372, 72, 0.8], [118, 96, 0.6], [300, 98, 0.7], [180, 84, 0.6], [20, 100, 0.7],
];

/** Fireflies, in canvas units; kept to the right and low so they never sit on the title. */
const FIREFLIES: Array<[number, number]> = [
  [304, 150], [346, 124], [372, 184], [262, 194], [322, 216], [190, 212], [120, 230],
];

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

function Firefly({ x, y, delay, still }: { x: number; y: number; delay: number; still: boolean }) {
  const glow = useRef(new Animated.Value(still ? 0.9 : 0.25)).current;
  useEffect(() => {
    if (still) {
      glow.setValue(0.9);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(glow, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.2, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [glow, delay, still]);
  return (
    <Animated.View pointerEvents="none" style={[styles.fly, { left: x - 9, top: y - 9, opacity: glow }]}>
      <View style={styles.flyInner}>
        <View style={styles.flyCore} />
      </View>
    </Animated.View>
  );
}

export function DuskScene({ crop = 0, children }: { crop?: number; children?: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const still = useReducedMotion();
  const k = width / SCENE_W;
  const height = (SCENE_H - crop) * k;
  const mirror = I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : null;

  return (
    <View style={{ width, height, backgroundColor: dusk.skyTop }}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Only the drawing is mirrored; React Native already places the fireflies (left:) from the right in Hebrew. */}
        <Svg width={width} height={height} viewBox={`0 ${crop} ${SCENE_W} ${SCENE_H - crop}`} style={mirror}>
          <Defs>
            <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={dusk.skyTop} />
              <Stop offset="0.55" stopColor={dusk.skyMid} />
              <Stop offset="1" stopColor={dusk.horizon} />
            </LinearGradient>
          </Defs>
          <Path d={`M0 0 H${SCENE_W} V${SCENE_H} H0 Z`} fill="url(#sky)" />
          {STARS.map(([x, y, r]) => (
            <Circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#FFFFFF" opacity={0.55} />
          ))}
          <Path
            d="M0 206 L38 186 L76 199 L120 158 L162 191 L206 148 L252 184 L294 164 L342 194 L400 168 V320 H0 Z"
            fill={dusk.ridgeFar}
          />
          <Path
            d="M0 236 L50 213 L96 231 L148 197 L196 229 L242 209 L300 238 L352 216 L400 234 V320 H0 Z"
            fill={dusk.ridgeMid}
          />
          <Path d="M0 266 C80 250 150 262 212 256 C282 249 340 262 400 251 V320 H0 Z" fill={dusk.ground} />
          {/* The trail: from the tent, along the valley and off over the hills. */}
          <Path
            d="M84 263 C140 270 214 279 270 271 C318 264 352 271 400 262"
            fill="none"
            stroke={dusk.glow}
            strokeWidth={2.4}
            strokeDasharray="0.5 7"
            strokeLinecap="round"
            opacity={0.9}
          />
          {/* A tent lit from inside. */}
          <Path d="M58 264 L72 242 L86 264 Z" fill="#FFB547" />
          <Path d="M69.5 264 L72 255 L74.5 264 Z" fill={dusk.ground} />
        </Svg>
        {FIREFLIES.map(([x, y], i) =>
          y > crop ? <Firefly key={i} x={x * k} y={(y - crop) * k} delay={i * 260} still={still} /> : null,
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fly: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 214, 90, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flyInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 214, 90, 0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flyCore: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFF4C2' },
});

/** "Firefly" and the tagline, set over the sky. */
export function Wordmark({ line }: { line?: string }) {
  const { t } = useI18n();
  return (
    <View>
      <Text style={wordStyles.word} accessibilityRole="header">
        Firefly
      </Text>
      <Text style={wordStyles.tagline}>{t('app.tagline')}</Text>
      {line ? <Text style={wordStyles.line}>{line}</Text> : null}
    </View>
  );
}

const wordStyles = StyleSheet.create({
  word: { color: dusk.text, fontSize: 46, fontWeight: '800', letterSpacing: -1, includeFontPadding: false },
  tagline: { color: dusk.textMuted, fontSize: 16, marginTop: 2 },
  line: { color: dusk.textMuted, fontSize: 14, marginTop: 10 },
});

/**
 * The section headers' backdrop: the same dusk hills, tinted with the section's colour
 * (orange camps, purple events, green trips). Fills its parent.
 */
export function SectionBackdrop({ accent }: { accent: string }) {
  const deep = '#120F2A';
  const id = `sky${accent.slice(1)}`;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 400 180" preserveAspectRatio="xMidYMax slice">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={mix(accent, deep, 0.62)} />
            <Stop offset="1" stopColor={mix(accent, deep, 0.08)} />
          </LinearGradient>
        </Defs>
        <Path d="M0 0 H400 V180 H0 Z" fill={`url(#${id})`} />
        <Path d="M0 138 L48 112 L92 128 L150 92 L198 124 L250 100 L306 132 L352 108 L400 126 V180 H0 Z" fill={mix(accent, deep, 0.38)} />
        <Path d="M0 156 C70 136 140 150 210 142 C280 134 340 152 400 138 V180 H0 Z" fill={mix(accent, deep, 0.6)} />
      </Svg>
    </View>
  );
}
