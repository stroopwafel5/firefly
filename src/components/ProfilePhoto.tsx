import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useI18n } from '../i18n';
import { errorCode, updateUserProfile, uploadProfilePhoto } from '../services/userService';
import { colors } from '../theme';
import { Text } from './Text';
import { toast } from './ui';

/**
 * The profile photo with a camera badge: tap it to choose a photo from the phone. It is uploaded
 * and saved on the profile at once (no separate Save). Used on the profile page and the edit page.
 * Everything is inside try/catch: a picker or upload that fails says so instead of closing the app.
 */
export function ProfilePhoto({
  uid,
  photo,
  size = 96,
  onChange,
  showLabel = true,
}: {
  uid: string;
  photo: string;
  size?: number;
  onChange?: (url: string) => void;
  showLabel?: boolean;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(photo);
  const current = shown || photo;

  const pick = async () => {
    if (busy) return;
    try {
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, exif: false, base64: false });
      if (r.canceled || !r.assets?.[0]) return;
      const asset = r.assets[0];
      if (asset.fileSize && asset.fileSize > 10 * 1024 * 1024) {
        toast(t('user.photoTooBig'));
        return;
      }
      setBusy(true);
      setShown(asset.uri); // the chosen photo shows at once while it uploads
      const url = await uploadProfilePhoto(uid, asset.uri, asset.mimeType ?? 'image/jpeg');
      await updateUserProfile(uid, { photo: url });
      setShown(url);
      onChange?.(url);
      toast(t('user.photoSaved'));
    } catch (e) {
      setShown(photo);
      toast(`${t('common.error')} (${errorCode(e)})`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable onPress={pick} accessibilityRole="button" accessibilityLabel={t('user.changePhoto')} hitSlop={8}>
        <View style={{ width: size, height: size }}>
          {current ? (
            <Image source={{ uri: current }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />
          ) : (
            <MaterialCommunityIcons name="account-circle" size={size} color={colors.muted} />
          )}
          <View style={[styles.badge, { width: size * 0.34, height: size * 0.34, borderRadius: size * 0.17 }]}>
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <MaterialCommunityIcons name="camera" size={size * 0.19} color="#fff" />}
          </View>
        </View>
      </Pressable>
      {showLabel ? (
        <Pressable onPress={pick} hitSlop={8}>
          <Text style={styles.label}>{t('user.changePhoto')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    end: 0,
    bottom: 0,
    backgroundColor: colors.night,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  label: { marginTop: 6, color: colors.night, fontWeight: '600', fontSize: 14 },
});
