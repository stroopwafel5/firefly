import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, space } from '../theme';
import { Text } from './Text';
import { useTint } from './Tint';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * Fold-out ("harmonica") panels, as in the Different Route site and travel apps like Skyscanner:
 * a calm header row that opens to show more. Panels take the section's light tint (orange for
 * Camps, purple for Events, green for Trips — see Tint.tsx), never plain white. Motion is gentle (≈0.3 s ease-out) and is switched
 * off when the phone's "Remove animations" setting is on.
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const OPEN_MS = 300;
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

/** Press feedback for anything tappable: it settles in very slightly and softens, then springs back. */
export function PressableScale({
  onPress,
  onLongPress,
  style,
  children,
  disabled,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
  accessibilityHint,
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link' | 'switch' | 'checkbox' | 'radio' | 'tab';
  accessibilityState?: { selected?: boolean; checked?: boolean; expanded?: boolean; disabled?: boolean; busy?: boolean };
  accessibilityHint?: string;
}) {
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.025 * p.value }], opacity: 1 - 0.15 * p.value }));
  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      onPressIn={() => {
        p.value = reduced ? 1 : withTiming(1, { duration: 110, easing: EASE });
      }}
      onPressOut={() => {
        p.value = reduced ? 0 : withTiming(0, { duration: 220, easing: EASE });
      }}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, ...accessibilityState }}
      accessibilityHint={accessibilityHint}
      style={[style, anim]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** 0 → 1 as a panel opens, animated (or instant with reduced motion). */
function useOpenProgress(open: boolean) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    progress.value = reduced ? (open ? 1 : 0) : withTiming(open ? 1 : 0, { duration: OPEN_MS, easing: EASE });
  }, [open, reduced, progress]);
  return progress;
}

/** The animated body of a fold-out panel: grows to its content's height and fades in. */
export function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  const progress = useOpenProgress(open);
  const height = useSharedValue(0);
  const body = useAnimatedStyle(() => ({ height: height.value * progress.value, opacity: progress.value }));
  return (
    <Animated.View
      style={[styles.clip, body]}
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      {/* Laid out at its natural height (absolute), so the panel knows how far to open. */}
      <View
        style={styles.measure}
        onLayout={(e) => {
          height.value = e.nativeEvent.layout.height;
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

/** A chevron that turns to point up when its panel is open. */
export function Chevron({ open, color = colors.muted, size = 22 }: { open: boolean; color?: string; size?: number }) {
  const progress = useOpenProgress(open);
  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${progress.value * 180}deg` }] }));
  return (
    <Animated.View style={[styles.chevron, { backgroundColor: `${color}14` }, turn]}>
      <MaterialCommunityIcons name="chevron-down" size={size} color={color} />
    </Animated.View>
  );
}

/**
 * A titled fold-out panel. `summary` shows what's chosen inside while it is closed
 * ("Any time", "Autism, ADHD"…), so people can scan without opening everything.
 */
export function Accordion({
  title,
  summary,
  icon,
  color,
  open: controlled,
  defaultOpen = false,
  onToggle,
  flat,
  style,
  children,
}: {
  title: string;
  summary?: string;
  icon?: IconName;
  color?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
  /** Inside another panel: no card background or border of its own. */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const tint = useTint();
  const C = color ?? tint.accent;
  const [own, setOwn] = useState(defaultOpen);
  const open = controlled ?? own;
  const toggle = () => {
    if (controlled === undefined) setOwn(!open);
    onToggle?.(!open);
  };
  return (
    <View style={[flat ? [styles.flat, { borderTopColor: tint.line }] : [styles.card, { backgroundColor: tint.surface, borderColor: tint.line }], style]}>
      <PressableScale
        onPress={toggle}
        accessibilityLabel={summary ? `${title}. ${summary}` : title}
        accessibilityState={{ expanded: open }}
        style={styles.header}
      >
        {icon ? (
          <View style={[styles.icon, { backgroundColor: `${C}1F` }]}>
            <MaterialCommunityIcons name={icon} size={22} color={C} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {summary ? (
            <Text style={styles.summary} numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
        <Chevron open={open} color={C} />
      </PressableScale>
      <Collapsible open={open}>
        <View style={flat ? styles.flatBody : styles.body}>{children}</View>
      </Collapsible>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: space.md,
    overflow: 'hidden',
  },
  flat: { borderTopWidth: 1 },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  summary: { fontSize: 14, color: colors.muted, marginTop: 2 },
  chevron: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  clip: { overflow: 'hidden' },
  measure: { position: 'absolute', top: 0, left: 0, right: 0 },
  body: { paddingHorizontal: space.lg, paddingBottom: space.lg },
  flatBody: { paddingHorizontal: space.lg, paddingBottom: space.md },
});
