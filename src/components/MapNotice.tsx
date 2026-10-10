import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useI18n } from '../i18n';
import { useTint } from './Tint';
import { colors, font, space } from '../theme';

/** Shown instead of a Google map while the app has no Maps key (a map without one crashes). */
export function MapNotice() {
  const { t } = useI18n();
  const tint = useTint();
  return (
    <View style={[StyleSheet.absoluteFill, styles.box, { backgroundColor: tint.surface }]}>
      <MaterialCommunityIcons name="map-marker-off-outline" size={32} color={colors.muted} />
      <Text style={[font.small, styles.text]}>{t('common.noMapKey')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', padding: space.lg },
  text: { textAlign: 'center', marginTop: space.sm },
});
