import React, { useMemo, useState } from 'react';
import { I18nManager, Modal, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useI18n } from '../i18n';
import { colors, font, space } from '../theme';
import { PressableScale } from './Accordion';
import { Text } from './Text';
import { useTint } from './Tint';
import { IconButton } from './ui';

/**
 * A calendar date picker in the section's tint (light orange / purple / green), with big day
 * buttons. No extra native module; mirrors automatically in Hebrew.
 */
export function DateField({
  label,
  value,
  onChange,
  min,
  clearable,
  color,
}: {
  label: string;
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  min?: Date;
  clearable?: boolean;
  color?: string;
}) {
  const { t, date } = useI18n();
  const tint = useTint();
  const C = color ?? tint.accent;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const base = value ?? min ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  }, [month]);

  const minDay = min ? new Date(min.getFullYear(), min.getMonth(), min.getDate()) : undefined;
  const same = (a?: Date, b?: Date) => !!a && !!b && a.toDateString() === b.toDateString();
  const today = new Date();
  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => date(new Date(2024, 0, 1 + i), { weekday: 'narrow' })),
    [date],
  );
  const prev = I18nManager.isRTL ? 'chevron-right' : 'chevron-left';
  const next = I18nManager.isRTL ? 'chevron-left' : 'chevron-right';

  return (
    <View style={{ marginBottom: space.md, flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <PressableScale
        style={[styles.field, { backgroundColor: tint.field, borderColor: tint.line }]}
        onPress={() => setOpen(true)}
        accessibilityLabel={value ? `${label}: ${date(value)}` : label}
      >
        <MaterialCommunityIcons name="calendar-month-outline" size={20} color={C} />
        <Text style={[font.body, { flex: 1, color: value ? colors.text : colors.muted }]} numberOfLines={1}>
          {value ? date(value) : t('common.pickDate')}
        </Text>
        {clearable && value ? <IconButton icon="close-circle" size={20} color={C} label={t('common.clearFilters')} onPress={() => onChange(undefined)} /> : null}
      </PressableScale>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: tint.page, borderColor: tint.line }]} onPress={() => undefined}>
            <Text style={[font.small, { textAlign: 'center' }]}>{label}</Text>
            <View style={styles.monthRow}>
              <View style={[styles.navBtn, { backgroundColor: tint.surface }]}>
                <IconButton icon={prev} color={C} label="previous month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
              </View>
              <Text style={[font.h3, { flex: 1, textAlign: 'center' }]}>{date(month, { month: 'long', year: 'numeric' })}</Text>
              <View style={[styles.navBtn, { backgroundColor: tint.surface }]}>
                <IconButton icon={next} color={C} label="next month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} />
              </View>
            </View>
            <View style={styles.grid}>
              {weekdays.map((w, i) => (
                <Text key={`w${i}`} style={styles.weekday}>
                  {w}
                </Text>
              ))}
              {cells.map((d, i) => {
                if (!d) return <View key={`e${i}`} style={styles.cell} />;
                const disabled = !!minDay && d < minDay;
                const selected = same(d, value);
                const isToday = same(d, today);
                return (
                  <View key={d.toISOString()} style={styles.cell}>
                    <PressableScale
                      disabled={disabled}
                      accessibilityLabel={date(d)}
                      accessibilityState={{ selected, disabled }}
                      onPress={() => {
                        onChange(d);
                        setOpen(false);
                      }}
                      style={[
                        styles.day,
                        selected ? { backgroundColor: C } : isToday ? { borderWidth: 1.5, borderColor: C } : null,
                      ]}
                    >
                      <Text style={{ fontSize: 16, color: selected ? '#fff' : disabled ? tint.line : colors.text, fontWeight: selected ? '600' : '400' }}>{d.getDate()}</Text>
                    </PressableScale>
                  </View>
                );
              })}
            </View>
            <Pressable onPress={() => setOpen(false)} style={[styles.close, { backgroundColor: tint.surface }]} accessibilityRole="button">
              <Text style={[font.body, { color: C, fontWeight: '600' }]}>{t('common.close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '500', color: colors.muted, marginBottom: 6 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: space.md,
    minHeight: 52,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(27,27,58,0.45)', justifyContent: 'center', padding: space.lg },
  sheet: { borderRadius: 24, borderWidth: 1, padding: space.lg },
  monthRow: { flexDirection: 'row', alignItems: 'center', marginVertical: space.sm },
  navBtn: { borderRadius: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: colors.muted, paddingVertical: 6, fontSize: 13 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  close: { marginTop: space.md, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
