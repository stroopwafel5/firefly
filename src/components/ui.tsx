import React from 'react';
import { ActivityIndicator, I18nManager, Pressable, ScrollView, StyleProp, StyleSheet, TextInputProps, ToastAndroid, View, ViewStyle } from 'react-native';
import { Text, TextInput } from './Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { config } from '../config';
import { PressableScale } from './Accordion';
import { SectionBackdrop } from './DuskScene';
import { TintProvider, tintFor, useTint } from './Tint';
import { useI18n } from '../i18n';
import { colors, font, radius, space } from '../theme';

export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export function toast(message: string) {
  ToastAndroid.show(message, ToastAndroid.LONG);
}

export async function openLink(url: string) {
  if (!url) return;
  await WebBrowser.openBrowserAsync(url, { showTitle: true, enableBarCollapsing: true });
}

/** The back arrow used in screen headers; points the right way in Hebrew (right-to-left). */
export function BackButton({ onPress, color = '#fff' }: { onPress: () => void; color?: string }) {
  const { t } = useI18n();
  return (
    <View style={styles.back}>
      <IconButton icon={I18nManager.isRTL ? 'arrow-right' : 'arrow-left'} color={color} size={26} label={t('common.back')} onPress={onPress} />
    </View>
  );
}

/**
 * Every screen's header: the dusk landscape in the section's colour (orange camps, purple
 * events, green trips…), with the content on a light sheet that overlaps it with rounded
 * corners — the same look as the start and log-in screens. Screens opened on top of the tabs
 * (a camp page, a booking, an attraction…) get a back arrow automatically; tab screens don't.
 */
export function Screen({
  title,
  subtitle,
  accent = colors.night,
  right,
  children,
  scroll = true,
  back,
}: {
  title?: string;
  subtitle?: string;
  accent?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
  /** Force the back arrow on or off (default: shown when the screen sits above the tabs). */
  back?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const showBack = back ?? (nav.getState()?.type === 'stack' && nav.canGoBack());
  const header = title ? (
    <View style={[styles.header, { paddingTop: insets.top + space.md }]}>
      <SectionBackdrop accent={accent} />
      <View style={styles.headerRow}>
        {showBack ? <BackButton onPress={() => nav.goBack()} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    </View>
  ) : null;
  const page = tintFor(accent).page;
  return (
    <TintProvider accent={accent}>
      <View style={[styles.screen, { backgroundColor: page }]}>
        {header}
        <View style={[styles.sheet, { backgroundColor: page }, header ? styles.sheetOverlap : null]}>
          {!config.firebaseConfigured ? <PreviewNotice /> : null}
          {scroll ? (
            <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }}>{children}</View>
          )}
        </View>
      </View>
    </TintProvider>
  );
}

export function Button({
  label,
  onPress,
  color = colors.night,
  icon,
  outline,
  disabled,
  loading,
  small,
  style,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  icon?: IconName;
  outline?: boolean;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = outline ? color : '#fff';
  return (
    <PressableScale
      accessibilityLabel={label}
      accessibilityState={{ busy: !!loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: outline ? 'transparent' : color, borderColor: color, opacity: disabled ? 0.45 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <MaterialCommunityIcons name={icon} size={small ? 16 : 18} color={fg} /> : null}
          <Text style={[styles.buttonText, small && { fontSize: 13 }, { color: fg }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </PressableScale>
  );
}

export function IconButton({ icon, onPress, color = colors.text, label, size = 22 }: { icon: IconName; onPress: () => void; color?: string; label: string; size?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={10} style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}>
      <MaterialCommunityIcons name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, color = colors.night, icon }: { label: string; selected?: boolean; onPress?: () => void; color?: string; icon?: IconName }) {
  const tint = useTint();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityState={{ selected: !!selected }}
      style={[styles.chip, { borderColor: color, backgroundColor: selected ? color : tint.field }]}
    >
      {selected ? <MaterialCommunityIcons name="check" size={16} color="#fff" /> : icon ? <MaterialCommunityIcons name={icon} size={16} color={color} /> : null}
      <Text style={[styles.chipText, { color: selected ? '#fff' : color }]}>{label}</Text>
    </PressableScale>
  );
}

export function Field({ label, error, style, ...props }: TextInputProps & { label: string; error?: string }) {
  const tint = useTint();
  return (
    <View style={{ marginBottom: space.md }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        {...props}
        style={[
          styles.input,
          { backgroundColor: tint.field, borderColor: tint.line },
          props.multiline && { minHeight: 80, textAlignVertical: 'top' },
          props.editable === false && { backgroundColor: tint.surface },
          error ? { borderColor: colors.danger } : null,
          style,
        ]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={{ marginTop: space.xl }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
        <Text style={[font.h2, { flex: 1 }]}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.night} />
      {label ? <Text style={[font.small, { marginTop: space.md }]}>{label}</Text> : null}
    </View>
  );
}

export function Empty({ text, icon = 'compass-outline' }: { text: string; icon?: IconName }) {
  return (
    <View style={[styles.center, { paddingVertical: space.xxl }]}>
      <MaterialCommunityIcons name={icon} size={40} color={colors.muted} />
      <Text style={[font.small, { marginTop: space.sm, textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}

/** A card in the section's tint (light orange / purple / green…), never plain white. */
export function Card({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const tint = useTint();
  return <View style={[styles.card, { backgroundColor: tint.surface, borderColor: tint.line }, style]}>{children}</View>;
}

/** The card colours, for cards that are themselves buttons (PressableScale, Pressable). */
export function useCardStyle(): ViewStyle {
  const tint = useTint();
  return { backgroundColor: tint.surface, borderColor: tint.line };
}

export function Badge({ text, color = colors.night, icon }: { text: string; color?: string; icon?: IconName }) {
  return (
    <View style={[styles.badge, { backgroundColor: `${color}1A` }]}>
      {icon ? <MaterialCommunityIcons name={icon} size={14} color={color} /> : null}
      <Text style={[styles.badgeText, { color }]}>{text}</Text>
    </View>
  );
}

export function Row({ children, style, wrap }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Stepper({ label, value, onChange, min = 0, max = 12 }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginBottom: space.sm }}>
      <Text style={font.body}>{label}</Text>
      <Row>
        <IconButton icon="minus-circle-outline" label={`${label} −`} onPress={() => onChange(Math.max(min, value - 1))} />
        <Text style={[font.h3, { minWidth: 24, textAlign: 'center' }]}>{value}</Text>
        <IconButton icon="plus-circle-outline" label={`${label} +`} onPress={() => onChange(Math.min(max, value + 1))} />
      </Row>
    </Row>
  );
}

export function Toggle({ label, value, onChange, color = colors.night }: { label: string; value: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} style={styles.toggleRow}>
      <MaterialCommunityIcons name={value ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={value ? color : colors.muted} />
      <Text style={[font.body, { flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

/** How far the light content sheet rides up over the header, and its corner radius. */
const SHEET_OVERLAP = 24;
const SHEET_RADIUS = 26;

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, paddingBottom: space.xl + SHEET_OVERLAP, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', minHeight: 64 },
  headerTitle: { fontSize: 28, fontWeight: '700', color: '#fff', letterSpacing: -0.2 },
  headerSubtitle: { fontSize: 14, lineHeight: 19, color: 'rgba(255,255,255,0.88)', marginTop: 3 },
  sheet: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    overflow: 'hidden',
  },
  sheetOverlap: { marginTop: -SHEET_OVERLAP },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  buttonSmall: { minHeight: 46, paddingVertical: 10, paddingHorizontal: space.lg },
  buttonText: { fontSize: 16, fontWeight: '600' },
  // Every tappable icon gets a full 48 × 48 touch area.
  iconButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  back: { alignSelf: 'center', marginStart: -space.sm, marginEnd: space.xs },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, borderWidth: 1.5, borderRadius: radius.pill, paddingVertical: 9, paddingHorizontal: 16, marginEnd: space.sm, marginBottom: space.sm },
  chipText: { fontSize: 15, fontWeight: '500' },
  label: { fontSize: 14, fontWeight: '500', color: colors.muted, marginBottom: 6, textAlign: 'left' },
  input: {
    backgroundColor: '#ECEBF4',
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 14,
    paddingHorizontal: space.md,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    textAlign: 'auto' as never,
  },
  error: { color: colors.danger, fontSize: 12, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: 13, fontWeight: '500' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, paddingVertical: 10 },
  // Cards sit on a hairline border instead of a heavy shadow: quieter on the eye.
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    marginBottom: space.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
  },
});

/** "Preview mode" strip while no Firebase project is configured (see services/firebase.ts). */
function PreviewNotice() {
  const { t } = useI18n();
  return (
    <View style={{ backgroundColor: '#FFE9CC', paddingHorizontal: space.lg, paddingVertical: space.sm }}>
      <Text style={[font.small, { color: '#8A4B00' }]}>{t('common.notConnected')}</Text>
    </View>
  );
}
