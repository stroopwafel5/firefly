import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '../../components/Text';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Empty, Field, Row, Screen, styles as ui, toast, useCardStyle } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import type { UserDoc } from '../../models';
import type { RootScreen } from '../../navigation/types';
import { getUsers, searchPeople, sendFriendRequest, watchOutgoingRequests } from '../../services/social';
import { addPeopleToTrip } from '../../services/tripService';
import { colors, font, radius, space } from '../../theme';

/**
 * Search people and send friend requests. Opened with `addToTripId`, it lists your friends
 * with an "Add to trip" button instead.
 */
export function FindPeopleScreen({ route, navigation }: RootScreen<'FindPeople'>) {
  const { t } = useI18n();
  const card = useCardStyle();
  const { profile } = useAuth();
  const tripId = route.params?.addToTripId;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<UserDoc[]>([]);
  const [pending, setPending] = useState<string[]>([]);

  useEffect(() => {
    if (!profile) return;
    if (tripId) getUsers(profile.friends).then(setResults);
    return watchOutgoingRequests(profile.uid, setPending);
  }, [profile, tripId]);

  if (!profile) return null;

  const search = async (text: string) => {
    setQ(text);
    if (tripId) return;
    if (text.trim().length < 2) return setResults([]);
    setResults(await searchPeople(text, profile.uid).catch(() => []));
  };

  const shown = tripId ? results.filter((u) => `${u.name} ${u.userName}`.toLowerCase().includes(q.toLowerCase())) : results;

  return (
    <Screen title={tripId ? t('plan.addPeople') : t('user.findPeople')} accent={colors.night}>
      <Field label={t('user.searchPeople')} value={q} onChangeText={search} autoCapitalize="none" />
      {!shown.length ? <Empty text={tripId ? t('user.noFriends') : t('common.noResults')} icon="account-search" /> : null}
      {shown.map((u) => {
        const isFriend = profile.friends.includes(u.uid);
        const sent = pending.includes(u.uid);
        return (
          <Row key={u.uid} style={[ui.card, card, { padding: space.md, marginBottom: space.sm }]}>
            {u.photo ? <Image source={{ uri: u.photo }} style={{ width: 44, height: 44, borderRadius: radius.pill }} /> : <MaterialCommunityIcons name="account-circle" size={44} color={colors.muted} />}
            <View style={{ flex: 1 }}>
              <Text style={font.h3}>{u.name}</Text>
              <Text style={font.small}>@{u.userName}</Text>
            </View>
            {tripId ? (
              <Button
                small
                label={t('user.addToTrip')}
                onPress={async () => {
                  try {
                    await addPeopleToTrip(tripId, [u.uid]);
                    toast(t('common.done'));
                    navigation.goBack();
                  } catch {
                    toast(t('common.error'));
                  }
                }}
              />
            ) : isFriend ? (
              <Button small outline label={t('user.message')} onPress={() => navigation.navigate('Chat', { uid: u.uid, name: u.name })} />
            ) : (
              <Button
                small
                outline={sent}
                disabled={sent}
                label={sent ? t('user.requestSent') : t('user.addFriend')}
                onPress={async () => {
                  try {
                    await sendFriendRequest(u.uid);
                  } catch {
                    toast(t('common.error'));
                  }
                }}
              />
            )}
          </Row>
        );
      })}
    </Screen>
  );
}
