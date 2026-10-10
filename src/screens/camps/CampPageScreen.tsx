import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text } from '../../components/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Accordion } from '../../components/Accordion';
import { PhotoCarousel } from '../../components/PhotoCarousel';
import { Badge, Button, IconButton, Loading, Row, Screen, Section, openLink, styles as ui } from '../../components/ui';
import { CampData, NOT_INCLUDED } from '../../data/camps';
import { useLists } from '../../hooks/useLists';
import { pick, useI18n } from '../../i18n';
import { DEFAULT_PROVIDER, type CampPage } from '../../models';
import type { TKey } from '../../i18n';
import type { RootScreen } from '../../navigation/types';
import { getCampPage } from '../../services/campService';
import { colors, font, space } from '../../theme';

/**
 * The single Camp Page screen: its content changes with the camp id. Shows the real photos
 * from differentroute.net and the day-by-day itinerary from the camp's page there.
 */
export function CampPageScreen({ route, navigation }: RootScreen<'CampPage'>) {
  const { t, lang, dateRange, price } = useI18n();
  const [data, setData] = useState<{ page: CampPage; data: CampData } | null>(null);
  const lists = useLists();

  useEffect(() => {
    getCampPage(route.params.campId, lang).then(setData);
  }, [route.params.campId, lang]);

  if (!data) {
    return (
      <Screen title={t('tab.camps')} accent={colors.camps}>
        <Loading />
      </Screen>
    );
  }
  const { page, data: camp } = data;
  const fav = lists.has('favouriteCamps', camp.id);
  const provider = camp.provider ?? DEFAULT_PROVIDER;
  const bookable = provider === DEFAULT_PROVIDER;
  const support = camp.disability ?? [];

  return (
    <Screen
      title={page.campName}
      subtitle={pick(camp.location, lang)}
      accent={colors.camps}
      right={
        <IconButton
          icon={fav ? 'heart' : 'heart-outline'}
          color="#fff"
          label={fav ? t('common.unfavourite') : t('common.favourite')}
          onPress={() => lists.toggle('favouriteCamps', camp.id)}
        />
      }
    >
      <PhotoCarousel photos={page.photos} sources={page.photoSources} itemId={`camp-${camp.id}`} rounded height={230} />
      <Text style={[font.small, { marginTop: 4 }]}>{t('camps.photosFrom')}</Text>

      <Row wrap style={{ marginTop: space.md }}>
        <Badge text={dateRange(page.startDate, page.endDate)} color={colors.camps} icon="calendar" />
        <Badge text={t('common.ages', { min: camp.minAge, max: camp.maxAge })} color={colors.camps} icon="account-child" />
        <Badge text={t('camps.priceFrom', { price: price(camp.price) })} color={colors.camps} icon="tag" />
      </Row>

      <Text style={[font.body, { marginTop: space.md }]}>{page.description}</Text>

      <View style={{ marginTop: space.xl }}>
        <Accordion title={t('camps.included')} summary={page.included[0]} icon="check-decagram-outline" color={colors.camps}>
          {page.included.map((line) => (
            <Row key={line} style={{ marginBottom: 6, alignItems: 'flex-start' }}>
              <MaterialCommunityIcons name="check" size={20} color={colors.success} />
              <Text style={[font.body, { flex: 1 }]}>{line}</Text>
            </Row>
          ))}
          <Text style={[font.small, { marginTop: 4 }]}>{pick(NOT_INCLUDED, lang)}</Text>
        </Accordion>
        <Accordion
          title={t('access.title')}
          summary={support.length ? support.map((n) => t(`access.${n}` as TKey)).join(', ') : t('camps.by', { provider })}
          icon="wheelchair-accessibility"
          color={colors.camps}
        >
          <Text style={font.body}>
            {support.length ? `${t('access.campSupports')}: ${support.map((n) => t(`access.${n}` as TKey)).join(', ')}` : t('access.campNone')}
          </Text>
          <Text style={[font.small, { marginTop: space.sm }]}>{t('camps.by', { provider })}</Text>
        </Accordion>
      </View>

      <Section title={t('camps.itinerary')}>
        {camp.itineraryNote ? <Text style={[font.small, { marginBottom: space.sm }]}>{pick(camp.itineraryNote, lang)}</Text> : null}
        {page.dayByDayItinerary.length ? (
          page.dayByDayItinerary.map((day, i) => (
            <Accordion
              key={i}
              title={t('camps.day', { n: i + 1 })}
              summary={day}
              icon="map-marker-outline"
              color={colors.camps}
              defaultOpen={i === 0}
            >
              <Text style={font.body}>{day}</Text>
            </Accordion>
          ))
        ) : (
          <Text style={font.body}>{t('camps.noItinerary')}</Text>
        )}
      </Section>

      <View style={{ marginTop: space.xl, gap: space.sm }}>
        {bookable ? (
          <Button label={t('camps.book')} color={colors.camps} icon="pencil" onPress={() => navigation.navigate('CampBooking', { campId: camp.id })} />
        ) : (
          <Text style={font.small}>{t('camps.bookingSoon', { provider })}</Text>
        )}
        <Button label={t('camps.onSite')} outline color={colors.camps} icon="open-in-new" onPress={() => openLink(page.sourceUrl)} />
      </View>
    </Screen>
  );
}
