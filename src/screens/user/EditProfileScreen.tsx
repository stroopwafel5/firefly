import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Field, Screen, toast } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import type { RootScreen } from '../../navigation/types';
import { updateUserProfile, uploadProfilePhoto } from '../../services/userService';
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

  const pickPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (r.canceled || !r.assets?.[0]) return;
    setBusy(true);
    try {
      setPhoto(await uploadProfilePhoto(profile.uid, r.assets[0].uri));
    } catch {
      toast(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

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
    } catch {
      toast(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t('user.editProfile')} accent={colors.night}>
      <Pressable onPress={pickPhoto} style={{ alignSelf: 'center', marginBottom: space.lg }} accessibilityLabel={t('user.photo')}>
        {photo ? <Image source={{ uri: photo }} style={{ width: 110, height: 110, borderRadius: 55 }} /> : <MaterialCommunityIcons name="account-circle" size={110} color={colors.muted} />}
      </Pressable>
      <Field label={t('user.name')} value={name} onChangeText={setName} />
      <Field label={t('user.description')} value={description} onChangeText={setDescription} multiline />
      <Field label={t('user.dateOfBirth')} value={dob} onChangeText={setDob} placeholder="1990-05-31" />
      <Button label={t('common.save')} loading={busy} onPress={save} />
    </Screen>
  );
}
