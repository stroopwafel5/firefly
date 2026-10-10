import React from 'react';
import { View } from 'react-native';
import { Text } from './Text';
import Slider from '@react-native-community/slider';
import { useI18n } from '../i18n';
import { DAY_MAX, DAY_MIN } from '../planner/time';
import { colors, font, space } from '../theme';

/**
 * Daily schedule: start and end of each day, draggable from 07:00 to 01:00 the next morning
 * in 30-minute steps (defaults 08:00–20:00). The two handles can't cross (min 3 hours apart).
 */
export function TimeRangeSlider({
  start,
  end,
  onChange,
  color = colors.planner,
}: {
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  color?: string;
}) {
  const { t, clock } = useI18n();
  const MIN_GAP = 180;
  return (
    <View>
      <Text style={[font.h3, { textAlign: 'center', marginBottom: space.sm }]}>
        {t('planner.dayTimeValue', { start: clock(start), end: clock(end) })}
      </Text>
      <Text style={font.small}>{t('planner.dayStart')}</Text>
      <Slider
        minimumValue={DAY_MIN}
        maximumValue={DAY_MAX - MIN_GAP}
        step={30}
        value={start}
        minimumTrackTintColor={color}
        thumbTintColor={color}
        onValueChange={(v) => onChange(v, Math.max(end, v + MIN_GAP))}
        accessibilityLabel={t('planner.dayStart')}
      />
      <Text style={font.small}>{t('planner.dayEnd')}</Text>
      <Slider
        minimumValue={DAY_MIN + MIN_GAP}
        maximumValue={DAY_MAX}
        step={30}
        value={end}
        minimumTrackTintColor={color}
        thumbTintColor={color}
        onValueChange={(v) => onChange(Math.min(start, v - MIN_GAP), v)}
        accessibilityLabel={t('planner.dayEnd')}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={font.small}>{clock(DAY_MIN)}</Text>
        <Text style={font.small}>{clock(DAY_MAX)}</Text>
      </View>
    </View>
  );
}
