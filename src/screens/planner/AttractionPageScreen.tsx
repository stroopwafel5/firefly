import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../../components/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Accordion } from '../../components/Accordion';
import { PhotoCarousel } from '../../components/PhotoCarousel';
import { Button, Empty, IconButton, Loading, Row, Screen, Section, openLink, styles as ui, useCardStyle } from '../../components/ui';
import { useLists } from '../../hooks/useLists';
import { useI18n } from '../../i18n';
import { AccessibilitySource, Attraction, VERIFIABLE_NEEDS } from '../../models';
import type { TKey } from '../../i18n';
import type { RootScreen } from '../../navigation/types';
import { describeHours } from '../../planner/time';
import { ReviewJSON, api } from '../../services/api';
import { loadTrip } from '../../services/tripStore';
import { colors, font, space } from '../../theme';

const DAY_NAMES = [0, 1, 2, 3, 4, 5, 6];

/**
 * Attraction page: description, photos and reviews from past visitors, sourced from
 * TripAdvisor (every review links to the review itself). Places from Wikidata (the free backup
 * source) show their Wikipedia description and photo credit; they have no reviews. When
 * Tripadvisor can't answer, the copy saved in the trip is shown instead of an error.
 */

/** The attraction as saved in the trip (all days and must-sees). */
async function fromTrip(tripId: string | undefined, id: string): Promise<Attraction | null> {
  if (!tripId) return null;
  const trip = await loadTrip(tripId).catch(() => null);
  return [...(trip?.mustSee ?? []), ...(trip?.itinerary.flatMap((d) => d.attractions) ?? [])].find((a) => a.id === id) ?? null;
}
export function AttractionPageScreen({ route }: RootScreen<'Attraction'>) {
  const { t, lang, clock, date } = useI18n();
  const lists = useLists();
  const card = useCardStyle();
  const [data, setData] = useState<{ a: Attraction; reviews: ReviewJSON[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const { id, tripId } = route.params;
    const saved = () => fromTrip(tripId, id).then((a) => (a ? setData({ a, reviews: [] }) : setFailed(true)));
    if (id.startsWith('wd-')) {
      saved();
      return;
    }
    api
      .attractionDetails({ id, lang })
      .then((r) => setData({ a: Attraction.fromJSON(r.attraction), reviews: r.reviews }))
      .catch(saved);
  }, [route.params, lang]);

  // Header (with its back arrow) while loading or after an error, so the user is never stuck.
  if (failed || !data) {
    return (
      <Screen title={t('tab.planner')} accent={colors.planner}>
        {failed ? <Empty text={t('common.error')} /> : <Loading />}
      </Screen>
    );
  }
  const { a, reviews } = data;
  const fav = lists.has('favouriteAttraction', a.id);
  // Show the week starting Monday.
  const week = DAY_NAMES.map((i) => new Date(2024, 0, 1 + i)); // 1 Jan 2024 was a Monday

  return (
    <Screen
      title={a.name}
      subtitle={a.address}
      accent={colors.planner}
      right={<IconButton icon={fav ? 'heart' : 'heart-outline'} color="#fff" label={t('common.favourite')} onPress={() => lists.toggle('favouriteAttraction', a.id)} />}
    >
      <PhotoCarousel photos={a.photo_urls} sources={a.photoSources} itemId={a.id} rounded height={230} />
      {a.rating ? (
        <Row style={{ marginTop: space.md }}>
          <MaterialCommunityIcons name="star" size={20} color={colors.firefly} />
          <Text style={font.h3}>{t('attraction.rating', { rating: a.rating, n: a.numReviews ?? 0 })}</Text>
        </Row>
      ) : null}

      <Section title={t('attraction.about')}>
        <Text style={font.body}>{a.description || '—'}</Text>
      </Section>

      <View style={{ marginTop: space.xl }}>
        <AccessibilityPanel id={a.id} website={a.website} />
      </View>

      <Section title={t('attraction.hours')}>
        {a.weeklyHours ? (
          week.map((d) => (
            <Row key={d.getDay()} style={{ justifyContent: 'space-between' }}>
              <Text style={font.body}>{date(d, { weekday: 'long' })}</Text>
              <Text style={font.body}>{describeHours(a.weeklyHours, d, clock) ?? '—'}</Text>
            </Row>
          ))
        ) : (
          <Text style={font.small}>{t('plan.hoursUnknown')}</Text>
        )}
      </Section>

      {a.provider === 'wikidata' ? (
        <Text style={[font.small, { marginTop: space.xl }]}>{t('attraction.fromWikipedia')}</Text>
      ) : (
      <Section title={t('attraction.reviews')}>
        {reviews.length ? (
          reviews.map((r) => (
            <View key={r.id} style={[ui.card, card, { padding: space.md, marginBottom: space.sm }]}>
              <Row>
                <Text style={{ color: colors.firefly, fontSize: 16 }}>{'★'.repeat(Math.round(r.rating))}</Text>
                <Text style={[font.small, { flex: 1 }]}>{`${r.user} · ${r.publishedDate.slice(0, 10)}`}</Text>
              </Row>
              {r.title ? <Text style={font.h3}>{r.title}</Text> : null}
              <Text style={font.body} numberOfLines={8}>{r.text}</Text>
              <Pressable onPress={() => openLink(r.url)} accessibilityRole="link">
                <Text style={[font.small, { color: colors.planner, fontWeight: '700', marginTop: 4 }]}>{t('attraction.readReview')}</Text>
              </Pressable>
            </View>
          ))
        ) : (
          <Text style={font.small}>{t('attraction.noReviews')}</Text>
        )}
        <Text style={[font.small, { marginTop: space.sm }]}>{t('attraction.poweredBy')}</Text>
      </Section>
      )}

      <Button
        label={a.provider === 'wikidata' ? t('attraction.openWikipedia') : t('attraction.openListing')}
        color={colors.attraction}
        icon="open-in-new"
        onPress={() => openLink(a.link)}
        style={{ marginTop: space.xl }}
      />
    </Screen>
  );
}

/**
 * What a verifiable source says about this place, need by need (blind, hard of hearing,
 * autism, physical). Each line links to the page that says so; nothing is guessed.
 */
function AccessibilityPanel({ id, website }: { id: string; website: string }) {
  const { t } = useI18n();
  const [result, setResult] = useState<{ needs: string[]; sources: AccessibilitySource[] } | null | 'loading'>('loading');
  useEffect(() => {
    let alive = true;
    api
      .attractionAccessibility({ id, website })
      .then((r) => alive && setResult(r))
      .catch(() => alive && setResult(null));
    return () => {
      alive = false;
    };
  }, [id, website]);

  const label = (n: string) => t(`access.${n}` as TKey);
  const summary =
    result === 'loading'
      ? t('access.checking')
      : result?.needs.length
        ? t('access.confirmed', { needs: result.needs.map(label).join(', ') })
        : t('access.noInfo');
  return (
    <Accordion title={t('access.title')} summary={summary} icon="wheelchair-accessibility" color={colors.planner}>
      {result === 'loading' ? (
        <Text style={font.small}>{t('access.checking')}</Text>
      ) : !result?.needs.length ? (
        <Text style={font.body}>{t('access.noInfo')}</Text>
      ) : (
        VERIFIABLE_NEEDS.map((n) => {
          const srcs = result.sources.filter((x) => x.need === n);
          return (
            <View key={n} style={{ marginBottom: space.md }}>
              <Row>
                <MaterialCommunityIcons name={srcs.length ? 'check-circle-outline' : 'minus-circle-outline'} size={20} color={srcs.length ? colors.success : colors.muted} />
                <Text style={[font.h3, { flex: 1 }]}>{label(n)}</Text>
              </Row>
              {srcs.map((src) => (
                <Pressable key={src.url} onPress={() => openLink(src.url)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text style={[font.small, { color: colors.planner }]}>
                    {src.by === 'organisation' ? src.org ?? src.url : t('access.byVenue')}
                    {src.phrase ? ` — “${src.phrase}”` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          );
        })
      )}
    </Accordion>
  );
}
