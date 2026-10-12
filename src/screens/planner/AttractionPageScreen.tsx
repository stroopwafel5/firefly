import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../../components/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Accordion } from '../../components/Accordion';
import { PhotoCarousel } from '../../components/PhotoCarousel';
import { Button, Empty, IconButton, Loading, Row, Screen, Section, openLink, styles as ui, useCardStyle } from '../../components/ui';
import { useLists } from '../../hooks/useLists';
import { useI18n } from '../../i18n';
import { AccessibilitySource, Attraction, Location, VERIFIABLE_NEEDS } from '../../models';
import type { TKey } from '../../i18n';
import type { RootScreen } from '../../navigation/types';
import { describeHours } from '../../planner/time';
import { ReviewJSON, api } from '../../services/api';
import { placeFromPhone, rememberPlace } from '../../services/placeStore';
import { loadTrip } from '../../services/tripStore';
import { colors, font, space } from '../../theme';

const DAY_NAMES = [0, 1, 2, 3, 4, 5, 6];

/**
 * Attraction page: description, photos and reviews from past visitors, sourced from
 * TripAdvisor (every review links to the review itself). Places from Google Maps, Wikidata or
 * OpenStreetMap show the copy saved in the trip, with where their description and opening hours
 * come from; they have no reviews here. When Tripadvisor can't answer, the saved copy is shown
 * instead of an error.
 */

/** Tripadvisor's answer, completed with what the trip already knew (a Wikipedia description, Google's hours). */
function withSaved(live: Attraction, saved: Attraction | null): Attraction {
  if (!saved) return live;
  if (saved.description.trim().length > live.description.trim().length) {
    live.description = saved.description;
    live.descriptionSource = saved.descriptionSource ?? saved.provider;
    live.descriptionUrl = saved.descriptionUrl;
  }
  if (saved.hoursSource === 'google' || (!live.weeklyHours && saved.weeklyHours)) {
    live.weeklyHours = saved.weeklyHours;
    live.openingHours = saved.openingHours;
    live.hoursSource = saved.hoursSource;
  }
  if (!live.photo_urls.length && saved.photo_urls.length) {
    live.photo_urls = saved.photo_urls;
    live.photoSources = saved.photoSources;
  }
  return live;
}

const isWikipedia = (url: string) => /^https?:\/\/[a-z-]+\.(m\.)?wikipedia\.org\//.test(url);

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
    // The trip's copy, else the copy kept on the phone when it was hearted (the profile's favourites).
    const savedCopy = fromTrip(tripId, id).then((a) => a ?? placeFromPhone(id));
    const saved = () => savedCopy.then((a) => (a ? setData({ a, reviews: [] }) : setFailed(true)));
    // Only Tripadvisor places (numeric ids) have a live page; the others are shown as saved.
    if (!/^\d+$/.test(id)) {
      saved();
      return;
    }
    api
      .attractionDetails({ id, lang })
      .then(async (r) => setData({ a: withSaved(Attraction.fromJSON(r.attraction), await savedCopy), reviews: r.reviews }))
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
      right={<IconButton icon={fav ? 'heart' : 'heart-outline'} color="#fff" label={t('common.favourite')} onPress={async () => (await lists.toggle('favouriteAttraction', a.id)) && rememberPlace(a)} />}
    >
      <PhotoCarousel photos={a.photo_urls} sources={a.photoSources} itemId={a.id} rounded height={230} />
      {a.rating ? (
        <Row style={{ marginTop: space.md }}>
          <MaterialCommunityIcons name="star" size={20} color={colors.firefly} />
          <Text style={font.h3}>
            {t((a.ratingSource ?? a.provider) === 'google' ? 'attraction.googleRating' : 'attraction.rating', { rating: a.rating, n: a.numReviews ?? 0 })}
          </Text>
        </Row>
      ) : null}

      <Section title={t('attraction.about')}>
        <Text style={font.body}>{a.description || '—'}</Text>
        {a.description ? (
          <Row wrap style={{ marginTop: space.sm }}>
            <Text style={font.small}>{t('attraction.descriptionFrom', { source: t(`attraction.src.${a.descriptionSource ?? a.provider}` as TKey) })}</Text>
            {a.descriptionUrl ? (
              <Pressable onPress={() => openLink(a.descriptionUrl!)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={[font.small, { color: colors.planner, fontWeight: '700' }]}>{t('attraction.readArticle')}</Text>
              </Pressable>
            ) : null}
          </Row>
        ) : null}
      </Section>

      <View style={{ marginTop: space.xl }}>
        <AccessibilityPanel id={a.id} website={a.website} name={a.name} location={a.location} known={a.accessibilitySources} />
      </View>

      <Section title={t('attraction.hours')}>
        {a.weeklyHours ? (
          week.map((d) => (
            <Row key={d.getDay()} style={{ justifyContent: 'space-between' }}>
              <Text style={font.body}>{date(d, { weekday: 'long' })}</Text>
              <Text style={font.body}>{describeHours(a.weeklyHours, d, clock) ?? '—'}</Text>
            </Row>
          ))
        ) : null}
        <Text style={[font.small, { marginTop: space.sm }]}>
          {a.weeklyHours && a.hoursSource
            ? t('attraction.hoursFrom', { source: t(`attraction.src.${a.hoursSource}` as TKey) })
            : t('attraction.hoursNotConfirmed')}
        </Text>
      </Section>

      {a.provider !== 'tripadvisor' ? (
        <Text style={[font.small, { marginTop: space.xl }]}>
          {t(a.provider === 'google' ? 'attraction.fromGoogle' : a.provider === 'openstreetmap' ? 'attraction.fromMap' : 'attraction.fromWikipedia')}
        </Text>
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
        label={
          a.provider === 'tripadvisor'
            ? t('attraction.openListing')
            : a.provider === 'google'
              ? t('attraction.openGoogle')
              : isWikipedia(a.link)
                ? t('attraction.openWikipedia')
                : t('attraction.openMap')
        }
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
function AccessibilityPanel({ id, website, name, location, known }: { id: string; website: string; name: string; location: Location; known: AccessibilitySource[] }) {
  const { t } = useI18n();
  const [result, setResult] = useState<{ needs: string[]; sources: AccessibilitySource[] } | null | 'loading'>('loading');
  const { locLat: lat, locLon: lon } = location;
  useEffect(() => {
    let alive = true;
    // What the trip already confirmed (Google Maps' wheelchair data, say) plus a fresh check.
    const withKnown = (r: { needs: string[]; sources: AccessibilitySource[] } | null) => {
      const sources = [...(r?.sources ?? []), ...known.filter((k) => !(r?.sources ?? []).some((s) => s.need === k.need && s.url === k.url))];
      return sources.length ? { needs: [...new Set(sources.map((s) => s.need))], sources } : r;
    };
    api
      .attractionAccessibility({ id, website, name, lat, lon })
      .then((r) => alive && setResult(withKnown(r)))
      .catch(() => alive && setResult(withKnown(null)));
    return () => {
      alive = false;
    };
  }, [id, website, name, lat, lon, known]);

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
                    {src.by === 'organisation' ? src.org ?? src.url : src.by === 'map' ? t('access.byMap', { org: src.org ?? 'OpenStreetMap' }) : t('access.byVenue')}
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
