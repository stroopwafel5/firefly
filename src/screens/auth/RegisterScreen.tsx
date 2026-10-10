import React, { useState } from 'react';
import { Text } from '../../components/Text';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import type { RootScreen } from '../../navigation/types';
import { serverConfigured } from '../../services/firebase';
import { UserNameTakenError, authErrorKey, signUp } from '../../services/userService';
import { colors } from '../../theme';
import { AuthInput, AuthLayout, GuestOption, PrimaryButton, SwitchLink } from './AuthKit';
import { EMAIL_RE } from './LoginScreen';

const USERNAME_RE = /^[a-zA-Z0-9_.]+$/;

type Errors = Partial<Record<'name' | 'userName' | 'email' | 'password' | 'confirm' | 'form', string>>;

/** Create an account: name, username (how friends find you), e-mail and password. */
export function RegisterScreen({ navigation }: RootScreen<'Register'>) {
  const { t, lang } = useI18n();
  const { entered, continueAsGuest, holdWhile } = useAuth();
  const insideApp = entered;
  const [name, setName] = useState('');
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const e: Errors = {};
    const req = t('auth.err.required');
    if (!name.trim()) e.name = req;
    if (!userName.trim()) e.userName = req;
    else if (!USERNAME_RE.test(userName.trim())) e.userName = t('auth.userNameHint');
    if (!email.trim()) e.email = req;
    else if (!EMAIL_RE.test(email.trim())) e.email = t('auth.err.email');
    if (!password) e.password = req;
    else if (password.length < 6) e.password = t('auth.err.weakPassword');
    if (password && confirm !== password) e.confirm = t('auth.err.mismatch');
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!serverConfigured) return setErrors({ form: t('auth.err.noServer') });
    setBusy(true);
    try {
      await holdWhile(() => signUp(email, password, name, userName.trim(), lang));
      if (insideApp && navigation.canGoBack()) navigation.goBack();
    } catch (err) {
      setErrors(err instanceof UserNameTakenError ? { userName: t('user.userNameTaken') } : { form: t(authErrorKey(err)) });
      if (insideApp) continueAsGuest(); // a guest's session was replaced by the removed account: restore it
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t('auth.registerTitle')} onBack={insideApp ? () => navigation.goBack() : undefined}>
      <AuthInput label={t('user.name')} icon="account-outline" value={name} onChangeText={setName} error={errors.name} autoComplete="name" textContentType="name" />
      <AuthInput
        label={t('user.userName')}
        icon="at"
        value={userName}
        onChangeText={setUserName}
        error={errors.userName}
        hint={t('auth.userNameHint')}
        autoCapitalize="none"
        autoComplete="username-new"
      />
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
      />
      <AuthInput
        label={t('user.password')}
        icon="lock-outline"
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        hint={t('auth.passwordHint')}
        secure
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <AuthInput
        label={t('auth.confirmPassword')}
        icon="lock-check-outline"
        value={confirm}
        onChangeText={setConfirm}
        error={errors.confirm}
        secure
        autoCapitalize="none"
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {errors.form ? <Text style={{ color: colors.danger, fontSize: 14, marginBottom: 10 }}>{errors.form}</Text> : null}
      <PrimaryButton label={t('auth.register')} onPress={submit} loading={busy} />
      <SwitchLink question={t('auth.haveAccount')} action={t('auth.toLogin')} onPress={() => navigation.replace('SignIn')} />
      {insideApp ? null : <GuestOption onPress={continueAsGuest} />}
    </AuthLayout>
  );
}
