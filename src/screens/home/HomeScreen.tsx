import React from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '../../components/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DuskScene, SCENE_H, SCENE_W, Wordmark, dusk } from '../../components/DuskScene';
import type { IconName } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import type { RootParams, TabParams } from '../../navigation/types';
import { glowAccent } from '../../theme';

const TAB_BAR = 62;
const GAP = 14;
const PAD = 20;

type Nav = { navigate: (name: keyof TabParams | keyof RootParams) => void };

/**
 * The start screen: the dusk scene with the Firefly name, then four separate places to go —
 * Camps (orange), Events (purple), Trips (green) and My profile — each in its section's colour.
 */
export function HomeScreen() {
  const { t } = useI18n();
  const { firebaseUser, profile } = useAuth();
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const signedIn = !!firebaseUser && !firebaseUser.isAnonymous;
  const who = profile?.name || firebaseUser?.displayName || firebaseUser?.email || '';
  // Two rows of tiles share the space under the scene (scrolls on small phones).
  const free = height - SCENE_H * (width / SCENE_W) - TAB_BAR - insets.bottom - PAD - GAP;
  const tileHeight = Math.max(150, Math.min(200, free / 2));
  const tileWidth = (width - PAD * 2 - GAP) / 2;

  const tiles: Array<{ key: string; color: string; icon: IconName; title: string; sub: string; go: () => void }> = [
    { key: 'camps', color: glowAccent.camps, icon: 'tent', title: t('home.camps'), sub: t('home.campsSub'), go: () => nav.navigate('CampsTab') },
    { key: 'events', color: glowAccent.weekend, icon: 'party-popper', title: t('home.events'), sub: t('home.eventsSub'), go: () => nav.navigate('WeekendTab') },
    { key: 'trips', color: glowAccent.planner, icon: 'map-marker-path', title: t('home.planner'), sub: t('home.plannerSub'), go: () => nav.navigate('PlannerTab') },
    {
      key: 'profile',
      color: glowAccent.account,
      icon: 'account-circle',
      title: t('home.account'),
      sub: signedIn ? t('home.accountSub') : t('home.accountGuestSub'),
      go: () => nav.navigate(signedIn ? 'MeTab' : 'SignIn'),
    },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: dusk.ground }} bounces={false} showsVerticalScrollIndicator={false}>
      <DuskScene>
        <View style={{ paddingTop: insets.top + 20, paddingHorizontal: 24 }}>
          <Wordmark line={signedIn ? t('home.signedInAs', { name: who }) : t('home.guest')} />
        </View>
      </DuskScene>
      <View style={styles.grid}>
        {tiles.map((tile) => (
          <Pressable
            key={tile.key}
            accessibilityRole="button"
            accessibilityLabel={`${tile.title}. ${tile.sub}`}
            onPress={tile.go}
            style={({ pressed }) => [
              styles.tile,
              {
                width: tileWidth,
                height: tileHeight,
                backgroundColor: `${tile.color}${pressed ? '40' : '26'}`,
                borderColor: `${tile.color}59`,
              },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: tile.color }]}>
              <MaterialCommunityIcons name={tile.icon} size={26} color={dusk.ground} />
            </View>
            <View>
              <Text style={styles.title}>{tile.title}</Text>
              <Text style={styles.sub} numberOfLines={3}>
                {tile.sub}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: PAD, paddingTop: 4, paddingBottom: PAD },
  tile: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { color: dusk.text, fontSize: 21, fontWeight: '800' },
  sub: { color: dusk.textMuted, fontSize: 13, lineHeight: 18, marginTop: 3 },
});
