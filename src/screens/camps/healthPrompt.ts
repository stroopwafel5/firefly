import { Alert } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TKey } from '../../i18n';
import type { RootParams } from '../../navigation/types';

/**
 * After a booking: the health form isn't needed to pay, but every camper needs one on paper at
 * camp, so parents are asked straight away (or later, from My profile → Fill up health forms).
 */
export function askForHealthForm(
  navigation: NativeStackNavigationProp<RootParams>,
  t: (k: TKey, p?: Record<string, string | number>) => string,
  bookingId: string,
  camperName: string,
  title: string,
  later: () => void,
  intro?: string,
) {
  const ask = t('booking.healthNext', { name: camperName });
  Alert.alert(title, intro ? `${intro}\n\n${ask}` : ask, [
    { text: t('booking.healthLater'), style: 'cancel', onPress: later },
    { text: t('booking.healthNow'), onPress: () => navigation.replace('HealthForm', { bookingId }) },
  ]);
}
