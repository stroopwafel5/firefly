import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Text } from '../../components/Text';
import { toast } from '../../components/ui';
import { GROW_CANCEL_URL, GROW_RETURN_URL } from '../../data/terms';
import { useI18n } from '../../i18n';
import type { RootScreen } from '../../navigation/types';
import { watchBooking } from '../../services/bookingService';
import { colors, font, space } from '../../theme';
import { askForHealthForm } from './healthPrompt';

/**
 * Grow's secure card page inside the app. Card details are typed on Grow's page only. When Grow
 * sends the browser to our return URL, the app waits for the server to confirm the payment
 * (Grow tells the server directly), then asks for the health form.
 */
export function GrowScreen({ route, navigation }: RootScreen<'Grow'>) {
  const { t } = useI18n();
  const { bookingId, url } = route.params;
  const [waiting, setWaiting] = useState(false);
  const handled = useRef(false);

  // Once the card page says "done", watch the booking until the server marks it paid.
  useEffect(() => {
    if (!waiting) return;
    let finished = false;
    const done = (paid: boolean, name = '') => {
      if (finished) return;
      finished = true;
      if (paid) askForHealthForm(navigation, t, bookingId, name, t('booking.healthTitle'), () => navigation.popToTop());
      else {
        toast(t('booking.cardPending'));
        navigation.popToTop();
      }
    };
    const stop = watchBooking(bookingId, (b) => {
      if (b?.status === 'paid') done(true, b.camper.firstName);
      else if (b?.status === 'payment_failed') {
        finished = true;
        toast(t('booking.paymentFailed'));
        navigation.goBack();
      }
    });
    const timer = setTimeout(() => done(false), 45_000);
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, [waiting, bookingId, navigation, t]);

  const intercept = (next: string) => {
    if (handled.current) return false;
    if (next.startsWith(GROW_RETURN_URL)) {
      handled.current = true;
      setWaiting(true);
      return false;
    }
    if (next.startsWith(GROW_CANCEL_URL)) {
      handled.current = true;
      toast(t('booking.paymentCancelled'));
      navigation.goBack();
      return false;
    }
    return true;
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <WebView
        source={{ uri: url }}
        onShouldStartLoadWithRequest={(r) => intercept(r.url)}
        startInLoadingState
        renderLoading={() => <ActivityIndicator style={{ flex: 1 }} color={colors.camps} />}
      />
      {waiting ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)', padding: space.xl }}>
          <ActivityIndicator size="large" color={colors.camps} />
          <Text style={[font.body, { textAlign: 'center', marginTop: space.md }]}>{t('booking.cardPending')}</Text>
        </View>
      ) : null}
    </View>
  );
}
