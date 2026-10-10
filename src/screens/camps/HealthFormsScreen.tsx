import React, { useCallback, useEffect, useState } from 'react';
import { I18nManager, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PressableScale } from '../../components/Accordion';
import { Text } from '../../components/Text';
import { Empty, Loading, Row, Screen, styles as ui, useCardStyle } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import type { RootScreen } from '../../navigation/types';
import type { CampBooking } from '../../services/bookingService';
import { myCampBookings } from '../../services/healthForm';
import { colors, font, space } from '../../theme';

/** "Fill up health forms": one row per camp booking, showing whether its form is done. */
export function HealthFormsScreen({ navigation }: RootScreen<'HealthForms'>) {
  const { t } = useI18n();
  const card = useCardStyle();
  const { firebaseUser } = useAuth();
  const [rows, setRows] = useState<Array<{ booking: CampBooking; formComplete: boolean }> | null>(null);

  const load = useCallback(() => {
    if (!firebaseUser) return;
    myCampBookings(firebaseUser.uid)
      .then(setRows)
      .catch(() => setRows([]));
  }, [firebaseUser]);
  // Refresh when coming back from a form.
  useEffect(() => navigation.addListener('focus', load), [navigation, load]);

  const C = colors.camps;
  return (
    <Screen title={t('health.listTitle')} subtitle={t('health.subtitle')} accent={C}>
      <Text style={[font.body, { marginBottom: space.lg }]}>{t('health.listIntro')}</Text>
      {rows == null ? (
        <Loading />
      ) : !rows.length ? (
        <Empty text={t('health.noBookings')} icon="clipboard-text-outline" />
      ) : (
        rows.map(({ booking: b, formComplete }) => (
          <PressableScale
            key={b.id}
            onPress={() => navigation.navigate('HealthForm', { bookingId: b.id })}
            accessibilityLabel={`${b.camper.firstName} ${b.camper.lastName}, ${b.campName}`}
            style={[ui.card, card, { padding: space.lg }]}
          >
            <Row>
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>{`${b.camper.firstName} ${b.camper.lastName}`}</Text>
                <Text style={font.small}>{b.campName}</Text>
                <Row style={{ marginTop: space.sm }}>
                  <MaterialCommunityIcons name={formComplete ? 'check-circle' : 'alert-circle-outline'} size={18} color={formComplete ? colors.success : C} />
                  <Text style={[font.small, { color: formComplete ? colors.success : C }]}>{formComplete ? t('health.filled') : t('health.notFilled')}</Text>
                </Row>
              </View>
              <MaterialCommunityIcons name={I18nManager.isRTL ? 'chevron-left' : 'chevron-right'} size={26} color={colors.muted} />
            </Row>
          </PressableScale>
        ))
      )}
    </Screen>
  );
}
