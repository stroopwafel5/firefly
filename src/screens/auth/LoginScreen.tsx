import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../../components/Text';
import { toast } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import type { RootScreen } from '../../navigation/types';
import { serverConfigured } from '../../services/firebase';
import { authErrorKey, resetPassword, signIn } from '../../services/userService';
import { colors } from '../../theme';
import { AuthInput, AuthLayout, GuestOption, PrimaryButton, SwitchLink, authStyles } from './AuthKit';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Log in. It's the first screen when nobody is logged in; a guest can also open it from inside
 * the app (My profile, or when saving a favourite), and then returns where they were.
 */
export function LoginScreen({ navigation }: RootScreen<'SignIn'>) {
  const { t } = useI18n();
  const { entered, continueAsGuest } = useAuth();
  const insideApp = entered; // already inside the app as a guest
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e: typeof errors = {};
    if (!email.trim()) e.email = t('auth.err.required');
    else if (!EMAIL_RE.test(email.trim())) e.email = t('auth.err.email');
    if (!password) e.password = t('auth.err.required');
    setErrors(e);
    if (e.email || e.password) return;
    if (!serverConfigured) return setErrors({ form: t('auth.err.noServer') });
    setBusy(true);
    try {
      await signIn(email, password);
      // From the start screen the app opens by itself once logged in; from inside, go back.
      if (insideApp && navigation.canGoBack()) navigation.goBack();
    } catch (err) {
      setErrors({ form: t(authErrorKey(err)) });
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!EMAIL_RE.test(email.trim())) return setErrors({ email: t('auth.enterEmail') });
    if (!serverConfigured) return setErrors({ form: t('auth.err.noServer') });
    try {
      await resetPassword(email);
      setErrors({});
      toast(t('auth.resetSent', { email: email.trim() }));
    } catch (err) {
      setErrors({ form: t(authErrorKey(err)) });
    }
  };

  return (
    <AuthLayout title={t('auth.loginTitle')} onBack={insideApp ? () => navigation.goBack() : undefined}>
      <AuthInput
        label={t('user.email')}
        icon="email-outline"
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <AuthInput
        label={t('user.password')}
        icon="lock-outline"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secure
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Pressable accessibilityRole="button" onPress={forgot} hitSlop={8} style={{ alignSelf: 'flex-end', marginTop: -4, marginBottom: 18 }}>
        <Text style={authStyles.textButton}>{t('auth.forgot')}</Text>
      </Pressable>
      {errors.form ? <Text style={{ color: colors.danger, fontSize: 14, marginBottom: 10 }}>{errors.form}</Text> : null}
      <PrimaryButton label={t('auth.login')} onPress={submit} loading={busy} />
      <SwitchLink question={t('auth.noAccount')} action={t('auth.toRegister')} onPress={() => navigation.replace('Register')} />
      {insideApp ? null : (
        <View>
          <GuestOption onPress={continueAsGuest} />
        </View>
      )}
    </AuthLayout>
  );
}
