import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '../../components/Text';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Badge, Button, Chip, Empty, IconButton, Row, Screen, Section, openLink, styles as ui, toast, useCardStyle } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { wixThumb } from '../../data/camps';
import { LANGS, useI18n } from '../../i18n';
import type { TKey } from '../../i18n';
import { Attraction, Camp, Event, Trip, UserDoc } from '../../models';
import type { RootParams } from '../../navigation/types';
import { api } from '../../services/api';
import { listCamps } from '../../services/campService';
import { eventsByIds } from '../../services/eventService';
import { FriendRequest, getUsers, respondFriendRequest, watchIncomingRequests, watchNotifications } from '../../services/social';
import { myTrips } from '../../services/tripService';
import { signOut, updateUserProfile } from '../../services/userService';
import { colors, font, radius, space } from '../../theme';

/**
 * The user page: the camps, events and trips the user picked, favourite places, friends
 * (message them or add them to a trip), friend requests and in-app notifications.
 */
export function UserScreen() {
  const { t, lang, setLang, dateRange } = useI18n();
  const card = useCardStyle();
  const { firebaseUser, profile } = useAuth();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const [camps, setCamps] = useState<Camp[]>([]);
  const [going, setGoing] = useState<Event[]>([]);
  const [favEvents, setFavEvents] = useState<Event[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [places, setPlaces] = useState<Attraction[]>([]);
  const [friends, setFriends] = useState<UserDoc[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [unread, setUnread] = useState(0);

  const signedIn = !!firebaseUser && !firebaseUser.isAnonymous && !!profile;

  useEffect(() => {
    if (!signedIn || !profile) return;
    listCamps(lang).then(setCamps);
    eventsByIds(profile.bookedEvents, lang).then(setGoing);
    eventsByIds(profile.favouriteEvents, lang).then(setFavEvents);
    myTrips(profile.uid).then(setTrips).catch(() => undefined);
    getUsers(profile.friends).then(setFriends).catch(() => undefined);
    Promise.all(
      profile.favouriteAttraction.slice(0, 20).map((id) =>
        api.attractionDetails({ id, lang }).then((r) => Attraction.fromJSON(r.attraction)).catch(() => null),
      ),
    ).then((list) => setPlaces(list.filter((x): x is Attraction => !!x)));
    const off1 = watchIncomingRequests(profile.uid, setRequests);
    const off2 = watchNotifications(profile.uid, (n) => setUnread(n.filter((x) => !x.read).length));
    return () => {
      off1();
      off2();
    };
  }, [signedIn, profile, lang]);

  const languagePicker = (
    <Section title={t('user.language')}>
      <Row>
        {LANGS.map((l) => (
          <Chip
            key={l}
            label={t(`lang.${l}` as TKey)}
            selected={lang === l}
            onPress={async () => {
              if (l === lang) return;
              if ((l === 'he') !== (lang === 'he')) toast(t('user.rtlRestart'));
              if (profile) updateUserProfile(profile.uid, { language: l }).catch(() => undefined);
              await setLang(l);
            }}
          />
        ))}
      </Row>
    </Section>
  );

  if (!signedIn || !profile) {
    return (
      <Screen title={t('user.title')} subtitle={t('app.tagline')} accent={colors.night}>
        <Empty text={t('common.signInRequired')} icon="account-circle-outline" />
        <Button label={t('user.signIn')} onPress={() => nav.navigate('SignIn')} />
        <Button label={t('auth.register')} outline onPress={() => nav.navigate('Register')} style={{ marginTop: space.sm }} />
        {languagePicker}
      </Screen>
    );
  }

  const booked = camps.filter((c) => profile.bookedCamps.includes(c.id));
  const favCamps = camps.filter((c) => profile.favouriteCamps.includes(c.id));

  const campRow = (list: Camp[]) =>
    list.length ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {list.map((c) => (
          <Pressable key={c.id} onPress={() => nav.navigate('CampPage', { campId: c.id })} style={[ui.card, card, { width: 220, marginEnd: space.md }]}>
            <Image source={{ uri: wixThumb(c.photos[0].split('/media/')[1], 440, 240) }} style={{ width: 220, height: 110 }} contentFit="cover" />
            <View style={{ padding: space.sm }}>
              <Text style={font.h3} numberOfLines={1}>{c.name}</Text>
              <Text style={font.small}>{dateRange(c.startDate, c.endDate)}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    ) : (
      <Text style={font.small}>{t('user.empty')}</Text>
    );

  const eventRows = (list: Event[]) =>
    list.length ? (
      list.map((e) => (
        <Pressable key={e.id} onPress={() => openLink(e.link)} style={[ui.card, card, { padding: space.md, marginBottom: space.sm, borderStartWidth: 4, borderStartColor: colors.weekend }]}>
          <Text style={font.h3}>{e.name}</Text>
          <Text style={font.small}>{`${dateRange(e.startDate, e.endDate)} · ${e.venue}`}</Text>
        </Pressable>
      ))
    ) : (
      <Text style={font.small}>{t('user.empty')}</Text>
    );

  return (
    <Screen
      title={profile.name}
      subtitle={`@${profile.userName}`}
      accent={colors.night}
      right={
        <Row>
          <View>
            <IconButton icon="bell-outline" color="#fff" label={t('user.notifications')} onPress={() => nav.navigate('Notifications')} />
            {unread ? <Text style={{ position: 'absolute', top: 0, end: 0, backgroundColor: colors.firefly, borderRadius: 8, paddingHorizontal: 4, fontSize: 11, fontWeight: '800' }}>{unread}</Text> : null}
          </View>
          <IconButton icon="account-edit-outline" color="#fff" label={t('user.editProfile')} onPress={() => nav.navigate('EditProfile')} />
        </Row>
      }
    >
      <Row style={{ alignItems: 'flex-start' }}>
        {profile.photo ? (
          <Image source={{ uri: profile.photo }} style={{ width: 72, height: 72, borderRadius: 36 }} />
        ) : (
          <MaterialCommunityIcons name="account-circle" size={72} color={colors.muted} />
        )}
        <Text style={[font.body, { flex: 1 }]}>{profile.description || ''}</Text>
      </Row>

      {requests.length ? (
        <Section title={t('user.friendRequests')}>
          {requests.map((r) => (
            <Row key={r.from} style={[ui.card, card, { padding: space.md, marginBottom: space.sm }]}>
              <Text style={[font.h3, { flex: 1 }]}>{r.fromName}</Text>
              <Button small label={t('user.accept')} onPress={() => respondFriendRequest(r.from, true)} />
              <Button small outline label={t('user.decline')} onPress={() => respondFriendRequest(r.from, false)} />
            </Row>
          ))}
        </Section>
      ) : null}

      <Section title={t('user.bookedCamps')}>
        {campRow(booked)}
        {booked.length ? (
          <Button
            label={t('user.fillHealthForms')}
            icon="clipboard-plus-outline"
            color={colors.camps}
            onPress={() => nav.navigate('HealthForms')}
            style={{ marginTop: space.md }}
          />
        ) : null}
      </Section>
      <Section title={t('user.favouriteCamps')}>{campRow(favCamps)}</Section>
      <Section title={t('user.bookedEvents')}>{eventRows(going)}</Section>
      <Section title={t('user.favouriteEvents')}>{eventRows(favEvents)}</Section>

      <Section title={t('user.myTrips')}>
        {trips.length ? (
          trips.map((tr) => (
            <Pressable key={tr.id} onPress={() => nav.navigate('TripPlan', { tripId: String(tr.id) })} style={[ui.card, card, { padding: space.md, marginBottom: space.sm, borderStartWidth: 4, borderStartColor: colors.planner }]}>
              <Text style={font.h3}>{tr.name}</Text>
              <Row wrap>
                <Badge text={dateRange(tr.startDate, tr.endDate)} color={colors.planner} icon="calendar" />
                {tr.peopleIds().length > 1 ? <Badge text={`${tr.peopleIds().length}`} color={colors.planner} icon="account-multiple" /> : null}
              </Row>
            </Pressable>
          ))
        ) : (
          <Text style={font.small}>{t('user.empty')}</Text>
        )}
      </Section>

      <Section title={t('user.favouriteAttractions')}>
        {places.length ? (
          places.map((a) => (
            <Pressable key={a.id} onPress={() => nav.navigate('Attraction', { id: a.id })} style={[ui.card, card, { padding: space.md, marginBottom: space.sm }]}>
              <Text style={font.h3}>{a.name}</Text>
              <Text style={font.small}>{a.address}</Text>
            </Pressable>
          ))
        ) : (
          <Text style={font.small}>{t('user.empty')}</Text>
        )}
      </Section>

      <Section title={t('user.friends')} right={<Button small outline label={t('user.findPeople')} icon="account-search" onPress={() => nav.navigate('FindPeople')} />}>
        {friends.length ? (
          friends.map((f) => (
            <Row key={f.uid} style={[ui.card, card, { padding: space.md, marginBottom: space.sm }]}>
              {f.photo ? <Image source={{ uri: f.photo }} style={{ width: 40, height: 40, borderRadius: radius.pill }} /> : <MaterialCommunityIcons name="account-circle" size={40} color={colors.muted} />}
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>{f.name}</Text>
                <Text style={font.small}>@{f.userName}</Text>
              </View>
              <IconButton icon="message-text-outline" label={t('user.message')} onPress={() => nav.navigate('Chat', { uid: f.uid, name: f.name })} />
            </Row>
          ))
        ) : (
          <Text style={font.small}>{t('user.noFriends')}</Text>
        )}
      </Section>

      {languagePicker}
      <Button label={t('user.signOut')} outline icon="logout" onPress={signOut} style={{ marginTop: space.xl }} />
    </Screen>
  );
}
