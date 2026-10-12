import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LazyMap, MapPin, regionAround } from '../../components/LazyMap';
import { PressableScale } from '../../components/Accordion';
import { Text } from '../../components/Text';
import { useTint } from '../../components/Tint';
import { useI18n } from '../../i18n';
import { DayPlan, Location, PlacePhoto, Trip } from '../../models';
import { openLink } from '../../components/ui';
import { placePhotoFromWikipedia } from '../../services/wikipedia';
import { colors, font, space } from '../../theme';

export interface Stop {
  name: string;
  /** Day indexes (0-based) spent at this stop. */
  first: number;
  last: number;
  location: Location;
  /** A real photograph of the place (its best-known sight), when the plan has one. */
  photo: PlacePhoto | null;
}

/** The trip's stops in order: consecutive days in the same place are one stop. */
export function stopsOf(trip: Trip): Stop[] {
  const stops: Stop[] = [];
  trip.itinerary.forEach((d, i) => {
    const prev = stops[stops.length - 1];
    if (prev && prev.name === d.anchorName) prev.last = i;
    else stops.push({ name: d.anchorName, first: i, last: i, location: d.anchor, photo: d.placePhoto });
  });
  return stops;
}

/**
 * A stop's photo: the one the planner chose (its most popular sight with a real photograph —
 * Prague Castle, the Hungarian Parliament…), else the lead photo of the place's Wikipedia article.
 * Photos come from Wikimedia Commons or Tripadvisor with their credit; nothing AI-made.
 */
function useStopPhoto(stop: Stop, lang: Parameters<typeof placePhotoFromWikipedia>[1]): PlacePhoto | null {
  const [photo, setPhoto] = useState<PlacePhoto | null>(stop.photo);
  useEffect(() => {
    if (stop.photo) {
      setPhoto(stop.photo);
      return;
    }
    let alive = true;
    placePhotoFromWikipedia(stop.name, lang).then((p) => alive && setPhoto(p)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [stop.photo, stop.name, lang]);
  return photo;
}

function StopRow({ stop, index, here, days, onPress }: { stop: Stop; index: number; here: boolean; days: string; onPress: () => void }) {
  const { t, lang } = useI18n();
  const tint = useTint();
  const photo = useStopPhoto(stop, lang);
  const ink = here ? '#fff' : colors.attraction;
  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${index + 1}. ${stop.name}, ${days}`}
      accessibilityState={{ selected: here }}
      style={[styles.stop, { backgroundColor: here ? colors.attraction : tint.field, borderColor: here ? colors.attraction : tint.line }]}
    >
      <View>
        {photo ? (
          <Image source={{ uri: photo.url }} style={styles.photo} contentFit="cover" transition={200} accessibilityLabel={photo.title} />
        ) : (
          <View style={[styles.photo, { backgroundColor: colors.attractionSoft, alignItems: 'center', justifyContent: 'center' }]}>
            <MaterialCommunityIcons name="city-variant-outline" size={28} color={colors.attraction} />
          </View>
        )}
        <View style={[styles.num, { backgroundColor: here ? '#fff' : colors.attraction }]}>
          <Text style={{ color: here ? colors.attraction : '#fff', fontWeight: '700', fontSize: 13 }}>{index + 1}</Text>
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[font.h3, { color: ink }]} numberOfLines={1}>
          {stop.name}
        </Text>
        <Text style={{ fontSize: 14, color: ink, fontWeight: '500' }}>{days}</Text>
        {photo ? (
          <Pressable onPress={() => openLink(photo.sourcePage)} accessibilityRole="link" hitSlop={6}>
            <Text style={{ fontSize: 11, color: ink, opacity: 0.9 }} numberOfLines={1}>
              {t('plan.photoOf', { title: photo.title })}
              {photo.credit ? ` · ${photo.credit}` : ''}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </PressableScale>
  );
}

/**
 * The whole trip on one map, at the top of the plan: every stop in order (cities, and landmarks
 * like Plitvice) joined by a line, with a photo of each place and the days spent there. Tapping a
 * stop opens its first day; tapping a photo credit opens the photo's source page.
 */
export function RouteCard({ trip, dayIndex, onPickDay }: { trip: Trip; dayIndex: number; onPickDay: (i: number) => void }) {
  const { t } = useI18n();
  const tint = useTint();
  const stops = useMemo(() => stopsOf(trip), [trip]);
  const days = (s: Stop) => (s.first === s.last ? t('plan.day', { n: s.first + 1 }) : t('plan.daysRange', { from: s.first + 1, to: s.last + 1 }));
  const pins = useMemo<MapPin[]>(
    () =>
      stops.map((s, i) => ({
        id: `stop-${i}`,
        lat: s.location.locLat,
        lon: s.location.locLon,
        color: colors.attraction,
        title: `${i + 1}. ${s.name}`,
        description: days(s),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stops, t],
  );
  const line = useMemo(() => stops.map((s) => ({ lat: s.location.locLat, lon: s.location.locLon })), [stops]);
  return (
    <View style={[styles.card, { backgroundColor: tint.surface, borderColor: tint.line }]}>
      <View style={styles.titleRow}>
        <MaterialCommunityIcons name="map-marker-path" size={22} color={colors.attraction} />
        <Text style={[font.h2, { color: colors.attraction, flex: 1 }]}>{t('plan.route')}</Text>
      </View>
      <Text style={[font.small, { marginBottom: space.sm }]}>{t('plan.routeHint')}</Text>
      <LazyMap pins={pins} line={line} onPinPress={(id) => onPickDay(stops[Number(id.split('-')[1])]?.first ?? 0)} />
      <View style={{ marginTop: space.sm }}>
        {stops.map((s, i) => (
          <StopRow key={`${s.name}-${s.first}`} stop={s} index={i} here={dayIndex >= s.first && dayIndex <= s.last} days={days(s)} onPress={() => onPickDay(s.first)} />
        ))}
      </View>
    </View>
  );
}

/** One day on the map: its places in visiting order, joined by a line. */
export function DayMapCard({ day }: { day: DayPlan }) {
  const { t } = useI18n();
  const tint = useTint();
  const { pins, line } = useMemo(() => {
    const ordered = [...day.slots].sort((a, b) => a.start - b.start);
    const list: MapPin[] = [];
    if (day.base) list.push({ id: 'base', lat: day.base.location.locLat, lon: day.base.location.locLon, color: colors.hotel, title: day.base.name });
    ordered.forEach((s, i) => {
      const a = s.kind === 'attraction' ? day.findAttraction(s.refId) : undefined;
      const e = s.kind === 'event' ? day.findEvent(s.refId) : undefined;
      const r = s.kind === 'restaurant' ? day.findRestaurant(s.refId) : undefined;
      const item = a ?? e ?? r;
      if (!item) return;
      list.push({
        id: s.key,
        lat: item.location.locLat,
        lon: item.location.locLon,
        color: a ? colors.attraction : e ? colors.event : colors.restaurant,
        title: `${i + 1}. ${item.name}`,
      });
    });
    if (day.hotel) list.push({ id: 'hotel', lat: day.hotel.locLat, lon: day.hotel.locLon, color: colors.hotel, title: day.hotel.name });
    return { pins: list, line: list.map((p) => ({ lat: p.lat, lon: p.lon })) };
  }, [day]);
  // Framed on the day's own stops (and its hotel), not on where the day starts: on a travel day
  // that is the last city (Yerevan), and the map opened there instead of on Tbilisi's sights.
  const region = useMemo(() => {
    const stops = pins.filter((p) => p.id !== 'base');
    return regionAround(stops.length ? stops : pins);
  }, [pins]);
  if (pins.length < 1) return null;
  return (
    <View style={[styles.card, { backgroundColor: tint.surface, borderColor: tint.line }]}>
      <View style={styles.titleRow}>
        <MaterialCommunityIcons name="map-outline" size={22} color={colors.attraction} />
        <Text style={[font.h3, { color: colors.attraction, flex: 1 }]}>{t('plan.dayMap')}</Text>
      </View>
      {/* A new map for each day (a map keeps the place it first opened on). */}
      <LazyMap key={`${day.date.getTime()}:${day.anchorName}`} pins={pins} line={line} initialRegion={region} style={{ height: 220 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: space.md, marginBottom: space.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 2 },
  stop: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 84, borderRadius: 16, borderWidth: 1.5, padding: space.sm, marginBottom: 8 },
  photo: { width: 72, height: 66, borderRadius: 12 },
  num: { position: 'absolute', top: -6, start: -6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
});
