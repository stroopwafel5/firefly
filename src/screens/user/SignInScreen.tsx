import React, { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Button, Field, Screen, toast } from '../../components/ui';
import { useI18n } from '../../i18n';
import type { RootScreen } from '../../navigation/types';
import { UserNameTakenError, signIn, signUp } from '../../services/userService';
import { colors, font, space } from '../../theme';

export function SignInScreen({ navigation }: RootScreen<'SignIn'>) {
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [userName, setUserName] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      if (mode === 'in') await signIn(email, password);
      else await signUp(email, password, name, userName.replace(/[^a-zA-Z0-9_.]/g, ''), lang);
      navigation.goBack();
    } catch (e) {
      toast(e instanceof UserNameTakenError ? t('user.userNameTaken') : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={mode === 'in' ? t('user.signIn') : t('user.signUp')} subtitle={t('app.tagline')} accent={colors.night}>
      {mode === 'up' ? (
        <>
          <Field label={t('user.name')} value={name} onChangeText={setName} />
          <Field label={t('user.userName')} value={userName} onChangeText={setUserName} autoCapitalize="none" />
        </>
      ) : null}
      <Field label={t('user.email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Field label={t('user.password')} value={password} onChangeText={setPassword} secureTextEntry />
      <Button label={mode === 'in' ? t('user.signIn') : t('user.signUp')} loading={busy} onPress={go} />
      <Pressable onPress={() => setMode(mode === 'in' ? 'up' : 'in')} style={{ marginTop: space.lg }}>
        <Text style={[font.body, { color: colors.planner, textAlign: 'center' }]}>{mode === 'in' ? t('user.noAccount') : t('user.haveAccount')}</Text>
      </Pressable>
    </Screen>
  );
}
