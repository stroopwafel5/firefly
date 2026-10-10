import React, { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { Text } from '../../components/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Empty, Row, Screen, IconName, styles as ui, useCardStyle } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import type { TKey } from '../../i18n';
import type { RootScreen } from '../../navigation/types';
import { AppNotification, NotificationType, markRead, watchNotifications } from '../../services/social';
import { colors, font, space } from '../../theme';

const ICONS: Record<NotificationType, IconName> = {
  campBooked: 'tent',
  eventGoing: 'party-popper',
  tripCreated: 'map-marker-path',
  tripAdded: 'account-multiple-plus',
  friendRequest: 'account-plus',
  friendAccepted: 'account-check',
};

/** In-app notifications about friends (never e-mailed). */
export function NotificationsScreen({ navigation }: RootScreen<'Notifications'>) {
  const { t, date } = useI18n();
  const card = useCardStyle();
  const { profile } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => (profile ? watchNotifications(profile.uid, setItems) : undefined), [profile]);
  if (!profile) return null;

  const open = (n: AppNotification) => {
    markRead(profile.uid, n.id).catch(() => undefined);
    if (n.type === 'campBooked') navigation.navigate('CampPage', { campId: Number(n.targetId) });
    else if (n.type === 'tripAdded') navigation.navigate('TripPlan', { tripId: n.targetId });
    else if (n.type === 'friendRequest' || n.type === 'friendAccepted') navigation.navigate('Tabs');
  };

  return (
    <Screen title={t('user.notifications')} accent={colors.night}>
      {!items.length ? <Empty text={t('user.noNotifications')} icon="bell-outline" /> : null}
      {items.map((n) => (
        <Pressable key={n.id} onPress={() => open(n)} style={[ui.card, card, { padding: space.md, marginBottom: space.sm, opacity: n.read ? 0.7 : 1 }]}>
          <Row style={{ alignItems: 'flex-start' }}>
            <MaterialCommunityIcons name={ICONS[n.type]} size={22} color={n.read ? colors.muted : colors.planner} />
            <Text style={[font.body, { flex: 1, fontWeight: n.read ? '400' : '700' }]}>
              {t(`notif.${n.type}` as TKey, { name: n.fromName, target: n.target })}
            </Text>
          </Row>
          <Text style={[font.small, { marginTop: 4 }]}>{date(new Date(n.createdAt), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}
