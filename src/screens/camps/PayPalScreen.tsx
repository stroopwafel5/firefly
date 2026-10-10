import React, { useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { toast } from '../../components/ui';
import { PAYPAL_CANCEL_URL, PAYPAL_RETURN_URL } from '../../data/terms';
import { useI18n } from '../../i18n';
import type { RootScreen } from '../../navigation/types';
import { capturePaypal } from '../../services/bookingService';
import { colors } from '../../theme';
import { askForHealthForm } from './healthPrompt';

/**
 * PayPal approval inside the app. When PayPal redirects to our return URL the WebView stops
 * (the page never loads) and the server captures the payment.
 */
export function PayPalScreen({ route, navigation }: RootScreen<'PayPal'>) {
  const { t } = useI18n();
  const { bookingId, approveUrl, orderId, camperName = '' } = route.params;
  const [busy, setBusy] = useState(false);
  const handled = useRef(false);

  const finish = async (url: string) => {
    if (handled.current) return false;
    if (url.startsWith(PAYPAL_RETURN_URL)) {
      handled.current = true;
      setBusy(true);
      try {
        const r = await capturePaypal(bookingId, orderId);
        if (r.status === 'COMPLETED') {
          askForHealthForm(navigation, t, bookingId, camperName, t('booking.healthTitle'), () => navigation.popToTop(), t('booking.successPaypal'));
          return false;
        }
        toast(t('booking.paymentFailed'));
      } catch {
        toast(t('booking.paymentFailed'));
      }
      navigation.popToTop();
      return false;
    }
    if (url.startsWith(PAYPAL_CANCEL_URL)) {
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
        source={{ uri: approveUrl }}
        onShouldStartLoadWithRequest={(r) => {
          if (r.url.startsWith(PAYPAL_RETURN_URL) || r.url.startsWith(PAYPAL_CANCEL_URL)) {
            finish(r.url);
            return false;
          }
          return true;
        }}
        startInLoadingState
        renderLoading={() => <ActivityIndicator style={{ flex: 1 }} color={colors.camps} />}
      />
      {busy ? (
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.8)' }}>
          <ActivityIndicator size="large" color={colors.camps} />
        </View>
      ) : null}
    </View>
  );
}
