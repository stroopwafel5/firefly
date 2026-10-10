import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FilterPanel, Filters, emptyFilters } from '../../components/FilterPanel';
import { Chevron, Collapsible, PressableScale } from '../../components/Accordion';
import { Badge, Button, Empty, IconButton, Loading, Row, Screen, styles as ui, toast, useCardStyle } from '../../components/ui';
import { wixThumb } from '../../data/camps';
import { useLists } from '../../hooks/useLists';
import { useI18n } from '../../i18n';
import type { Camp, CampElement } from '../../models';
import { DEFAULT_PROVIDER } from '../../models';
import type { TKey } from '../../i18n';
import type { RootParams } from '../../navigation/types';
import { filterCamps, listCamps, providersOf } from '../../services/campService';
import { colors, font, space } from '../../theme';

/** Camps tab: Different Route camps as orange CampElement cards, filterable on every property. */
export function CampsScreen() {
  const { t, tp, lang } = useI18n();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const [camps, setCamps] = useState<Camp[] | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters());
  const [refreshing, setRefreshing] = useState(false);
  const lists = useLists();

  const load = async () => setCamps(await listCamps(lang));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const visible = useMemo(
    () =>
      camps
        ? filterCamps(camps, {
            name: filters.name,
            startsAfter: filters.from,
            endsBefore: filters.to,
            age: filters.age,
            country: filters.country,
            minPrice: filters.minPrice,
            maxPrice: filters.maxPrice,
            needs: filters.needs,
            provider: filters.provider,
          })
        : [],
    [camps, filters],
  );
  const countries = useMemo(() => [...new Set((camps ?? []).map((c) => c.country))], [camps]);
  const providers = useMemo(() => providersOf(camps ?? []), [camps]);

  if (!camps) {
    return (
      <Screen title={t('camps.title')} subtitle={t('camps.subtitle')} accent={colors.camps}>
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen title={t('camps.title')} subtitle={t('camps.subtitle')} accent={colors.camps} scroll={false}>
      <FlatList
        data={visible.map((c) => c.toElement())}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 2 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListHeaderComponent={
          <>
            <FilterPanel value={filters} onChange={setFilters} countries={countries} providers={providers} showAge showAccess color={colors.camps} />
            <Text style={[font.small, { marginBottom: space.sm }]}>{tp('filter.results', visible.length)}</Text>
          </>
        }
        ListEmptyComponent={<Empty text={filters.needs.length ? t('access.noCamps') : t('common.noResults')} icon="tent" />}
        renderItem={({ item }) => (
          <CampCard
            camp={item}
            favourite={lists.has('favouriteCamps', item.id)}
            booked={lists.has('bookedCamps', item.id)}
            onFavourite={async () => {
              const on = await lists.toggle('favouriteCamps', item.id);
              if (on != null) toast(on ? t('common.favourite') : t('common.unfavourite'));
            }}
            onOpen={() => nav.navigate('CampPage', { campId: item.id })}
            onBook={() => nav.navigate('CampBooking', { campId: item.id })}
          />
        )}
      />
    </Screen>
  );
}

function CampCard({
  camp,
  favourite,
  booked,
  onFavourite,
  onOpen,
  onBook,
}: {
  camp: CampElement;
  favourite: boolean;
  booked: boolean;
  onFavourite: () => void;
  onOpen: () => void;
  onBook: () => void;
}) {
  const { t, tp, dateRange, price, country } = useI18n();
  const card = useCardStyle();
  const [open, setOpen] = useState(false);
  const m = camp.meta;
  const days = Math.round((m.endDate.getTime() - m.startDate.getTime()) / 86_400_000) + 1;
  const photoFile = camp.photos[0]?.split('/media/')[1];
  const bookable = m.provider === DEFAULT_PROVIDER;
  const C = colors.camps;
  return (
    <View style={[ui.card, card]}>
      <PressableScale onPress={() => setOpen(!open)} accessibilityState={{ expanded: open }} accessibilityLabel={`${camp.name}. ${dateRange(m.startDate, m.endDate)}`}>
        {photoFile ? (
          <Image source={{ uri: wixThumb(photoFile) }} style={styles.photo} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
        ) : null}
        <View style={{ padding: space.lg, paddingBottom: space.sm }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={font.h2}>{camp.name}</Text>
              <Text style={font.small}>{country(m.country)}</Text>
            </View>
            <IconButton
              icon={favourite ? 'heart' : 'heart-outline'}
              color={C}
              label={favourite ? t('common.unfavourite') : t('common.favourite')}
              onPress={onFavourite}
            />
          </Row>
          <Row wrap style={{ marginTop: space.sm }}>
            <Badge text={dateRange(m.startDate, m.endDate)} color={C} icon="calendar" />
            <Badge text={t('common.ages', { min: m.minAge, max: m.maxAge })} color={C} icon="account-child" />
            <Badge text={t('common.fromPrice', { price: price(m.price, m.currency) })} color={C} icon="tag" />
            {booked ? <Badge text="✓" color={colors.success} /> : null}
          </Row>
          <Row style={{ justifyContent: 'space-between', marginTop: space.sm, minHeight: 44 }}>
            <Text style={[font.body, { color: C, fontWeight: '500' }]}>{open ? t('common.less') : t('common.more')}</Text>
            <Chevron open={open} color={C} />
          </Row>
        </View>
      </PressableScale>
      <Collapsible open={open}>
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
          <Text style={font.body}>{camp.description}</Text>
          <Row wrap style={{ marginTop: space.md }}>
            <Badge text={tp('common.days', days)} color={C} icon="weather-sunny" />
            <Badge text={t('camps.by', { provider: m.provider })} color={C} icon="domain" />
          </Row>
          <Text style={[font.small, { marginTop: space.sm }]}>
            {m.disability.length
              ? `${t('access.campSupports')}: ${m.disability.map((n) => t(`access.${n}` as TKey)).join(', ')}`
              : t('access.campNone')}
          </Text>
          <Row style={{ marginTop: space.md }}>
            <Button label={t('camps.viewPage')} outline color={C} icon="map-legend" onPress={onOpen} style={{ flex: 1 }} />
            {bookable ? <Button label={t('camps.book')} color={C} icon="pencil" onPress={onBook} style={{ flex: 1 }} /> : null}
          </Row>
          {bookable ? null : <Text style={[font.small, { marginTop: space.sm }]}>{t('camps.bookingSoon', { provider: m.provider })}</Text>}
        </View>
      </Collapsible>
    </View>
  );
}

const styles = StyleSheet.create({ photo: { width: '100%', height: 170 } });
