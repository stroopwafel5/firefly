import React, { useState } from 'react';
import { View } from 'react-native';
import { ProfilePhoto } from '../../components/ProfilePhoto';
import { Button, Field, Screen, toast } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import type { RootScreen } from '../../navigation/types';
import { errorCode, updateUserProfile } from '../../services/userService';
import { colors, space } from '../../theme';

export function EditProfileScreen({ navigation }: RootScreen<'EditProfile'>) {
  const { t } = useI18n();
  const { profile } = useAuth();
  const [name, setName] = useState(profile?.name ?? '');
  const [description, setDescription] = useState(profile?.description ?? '');
  const [dob, setDob] = useState(profile?.dateOfBirth ?? '');
  const [photo, setPhoto] = useState(profile?.photo ?? '');
  const [busy, setBusy] = useState(false);
  if (!profile) return null;

  const save = async () => {
    setBusy(true);
    try {
      await updateUserProfile(profile.uid, {
        name: name.trim(),
        description: description.trim(),
        dateOfBirth: /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : null,
        photo,
      });
      toast(t('common.saved'));
      navigation.goBack();
    } catch (e) {
      toast(`${t('common.error')} (${errorCode(e)})`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t('user.editProfile')} accent={colors.night}>
      <View style={{ alignSelf: 'center', marginBottom: space.lg }}>
        <ProfilePhoto uid={profile.uid} photo={photo} size={110} onChange={setPhoto} />
      </View>
      <Field label={t('user.name')} value={name} onChangeText={setName} />
      <Field label={t('user.description')} value={description} onChangeText={setDescription} multiline />
      <Field label={t('user.dateOfBirth')} value={dob} onChangeText={setDob} placeholder="1990-05-31" />
      <Button label={t('common.save')} loading={busy} onPress={save} />
    </Screen>
  );
}
