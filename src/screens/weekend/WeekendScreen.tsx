import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../components/Text';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';
import { EventsMap, regionFor, validPoint } from './EventsMap';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { FilterPanel, Filters, emptyFilters } from '../../components/FilterPanel';
import { Chevron, Collapsible, PressableScale } from '../../components/Accordion';
import { PhotoCarousel } from '../../components/PhotoCarousel';
import { Badge, Button, Chip, Empty, IconButton, Row, Screen, openLink, styles as ui, toast, useCardStyle } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { seedEvents } from '../../data/seedEvents';
import { useLists } from '../../hooks/useLists';
import { useI18n } from '../../i18n';
import type { TKey } from '../../i18n';
import { Event, Location } from '../../models';
import type { RootParams } from '../../navigation/types';
import { addDays } from '../../planner/generator';
import { haversineKm } from '../../planner/geo';
import { api } from '../../services/api';
import { EventSearchResult, filterEvents, offlineEvents, rememberEvent, searchEvents, syncFallbackSnapshot, weeklyPicks } from '../../services/eventService';
import { currentLocation } from '../../services/location';
import { config } from '../../config';
import { colors, font, radius, space } from '../../theme';
import { tintFor } from '../../components/Tint';

type Window = 'month' | 'thisWeekend' | 'nextWeekend';
/** Near me (live search), or this week's collected events in Israel / the rest of the world. */
type Scope = 'near' | 'israel' | 'world';
const SCOPES: Array<[Scope, string]> = [['near', 'crosshairs-gps'], ['israel', 'star-david'], ['world', 'earth']];
const ISRAEL_CENTER = new Location(31.6, 34.95);
/** Where Android emulators put you unless told otherwise (the Googleplex). */
const EMULATOR_DEFAULT = new Location(37.422, -122.084);

/** Where the search starts when the phone's location isn't available: Tel Aviv (where the map opens). */
const DEFAULT_CENTER = new Location(32.0853, 34.7818);
const LAST_CENTER_KEY = 'firefly.weekend.lastCenter.v1';

async function lastCenter(): Promise<Location | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_CENTER_KEY);
    const v = raw ? (JSON.parse(raw) as [number, number]) : null;
    return v && Number.isFinite(v[0]) && Number.isFinite(v[1]) ? new Location(v[0], v[1]) : null;
  } catch {
    return null;
  }
}

function windowDates(w: Window): { from: Date; to: Date } {
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (w === 'month') return { from: base, to: addDays(base, 30) };
  const dow = base.getDay(); // 0 = Sunday … 6 = Saturday
  const thisFri = dow === 0 ? addDays(base, -2) : dow === 6 ? addDays(base, -1) : addDays(base, 5 - dow);
  if (w === 'thisWeekend') return { from: thisFri < base ? base : thisFri, to: addDays(thisFri, 2) };
  const nextFri = addDays(thisFri, 7);
  return { from: nextFri, to: addDays(nextFri, 2) };
}

/**
 * Weekend tab: a big Google map with every event in the area, then the list (purple cards).
 * With no place typed it searches 100 km around the user's current location; typing a place
 * (anywhere in the world) or moving the map searches there instead — live, on demand.
 * Events the phone already has (built-in, the weekly snapshot, the last search) show at once;
 * the live results replace them when they arrive, so the screen never sits empty.
 */
export function WeekendScreen() {
  const { t, lang } = useI18n();
  const { isAdmin } = useAuth();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const mapRef = useRef<MapView>(null);
  const listRef = useRef<FlatList<Event>>(null);
  const [place, setPlace] = useState('');
  const [win, setWin] = useState<Window>('month');
  const [center, setCenter] = useState<Location | null>(null);
  const [radiusKm, setRadiusKm] = useState(config.defaultEventRadiusKm);
  const [result, setResult] = useState<EventSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [movedTo, setMovedTo] = useState<Region | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters());
  const [scope, setScope] = useState<Scope>('near');
  const [picks, setPicks] = useState<Event[] | null>(null);
  const placeInput = useRef<{ focus: () => void } | null>(null);
  /** Each search gets a number; an answer that comes back after a newer search started is dropped. */
  const runId = useRef(0);
  const centerRef = useRef<Location | null>(null);
  centerRef.current = center;
  /** Move the map only to a real position, and only once it exists (it starts just after the page). */
  const flyTo = (c: Location, km: number) => {
    if (validPoint(c)) mapRef.current?.animateToRegion(regionFor(c, km), 600);
  };

  const run = useCallback(
    async (opts: { center?: Location; place?: string; radius?: number }) => {
      const id = ++runId.current;
      const radius = opts.radius ?? radiusKm;
      const { from, to } = windowDates(win);
      setLoading(true);
      // Hand-checked events in the area are always included.
      const withCurated = (r: EventSearchResult): EventSearchResult => {
        const c = r.center ?? opts.center;
        const curated = seedEvents(lang).filter((e) => e.overlaps(from, to) && (!c || haversineKm(c, e.location) <= radius));
        const byId = new Map<string, Event>();
        [...curated, ...r.events].forEach((e) => byId.set(e.id, e));
        return { ...r, events: [...byId.values()].sort((a, b) => a.startDate.getTime() - b.startDate.getTime()) };
      };

      // 1. Straight away: what the phone already has for this area.
      if (opts.center) {
        const c = opts.center;
        const quick = await offlineEvents({ center: c, radiusKm: radius, from, to, lang });
        if (id !== runId.current) return;
        // Only what's really in the area (the offline fallback would otherwise list far-away events),
        // and not marked "offline": the live search is still coming.
        const near = quick.events.filter((e) => haversineKm(c, e.location) <= radius);
        setResult({ ...withCurated({ ...quick, events: near }), mode: 'live' });
      }

      // 2. The live search replaces it when it answers.
      const r = await searchEvents({ center: opts.center, place: opts.place, radiusKm: radius, from, to, lang });
      if (id !== runId.current) return;
      setResult(withCurated(r));
      if (r.center) {
        setCenter(r.center);
        flyTo(r.center, radius);
        if (r.mode === 'live') {
          AsyncStorage.setItem(LAST_CENTER_KEY, JSON.stringify([r.center.locLat, r.center.locLon])).catch(() => undefined);
        }
      }
      setLoading(false);
    },
    [win, lang, radiusKm],
  );

  // Default: 100 km around the user's current location. Changing the dates keeps the area.
  useEffect(() => {
    let cancelled = false;
    const started = runId.current;
    // A search the user started meanwhile (a place, the map, other dates) wins over this one.
    const superseded = () => cancelled || runId.current !== started;
    (async () => {
      if (centerRef.current) {
        await run({ center: centerRef.current });
        return;
      }
      syncFallbackSnapshot();
      setStatus(t('weekend.locating'));
      const here = await currentLocation();
      // No location (declined, or no fix within a few seconds): the last area searched, or Tel Aviv.
      const start = here ?? (await lastCenter()) ?? DEFAULT_CENTER;
      if (superseded()) return;
      setStatus(here ? '' : t('weekend.locationDenied'));
      setCenter(start);
      flyTo(start, config.defaultEventRadiusKm);
      await run({ center: start, radius: config.defaultEventRadiusKm });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win, lang]);

  useEffect(() => {
    if (scope === 'near') return;
    let alive = true;
    setPicks(null);
    weeklyPicks(scope, lang).then((list) => alive && setPicks(list));
    return () => {
      alive = false;
    };
  }, [scope, lang]);

  const listed = scope === 'near' ? (result?.events ?? []) : (picks ?? []);
  const visible = useMemo(() => filterEvents(listed, filters), [listed, filters]);
  const countries = useMemo(() => [...new Set(listed.map((e) => e.country).filter(Boolean))], [listed]);
  const onEmulatorDefault = scope === 'near' && !!center && haversineKm(center, EMULATOR_DEFAULT) < 25;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // Stable callbacks, so typing in the search box doesn't redraw the map and its pins.
  const onRegionChangeComplete = useCallback(
    (r: Region) => {
      if (!center) return;
      const km = haversineKm(center, new Location(r.latitude, r.longitude));
      setMovedTo(km > Math.max(15, radiusKm / 3) ? r : null);
    },
    [center, radiusKm],
  );
  const onPinPress = useCallback((id: string) => {
    const i = visibleRef.current.findIndex((x) => x.id === id);
    if (i >= 0) listRef.current?.scrollToIndex({ index: i, viewOffset: 0, animated: true });
  }, []);

  const searchPlace = () => {
    if (!place.trim()) {
      currentLocation().then((here) => here && run({ center: here, radius: config.defaultEventRadiusKm }));
      return;
    }
    setRadiusKm(50);
    run({ place: place.trim(), radius: 50 });
  };

  return (
    <Screen
      title={t('weekend.title')}
      subtitle={t('weekend.subtitle')}
      accent={colors.weekend}
      scroll={false}
      right={isAdmin ? <IconButton icon="plus-circle" color="#fff" size={28} label={t('weekend.addEvent')} onPress={() => nav.navigate('AddEvent')} /> : undefined}
    >
      <FlatList
        ref={listRef}
        data={visible}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingBottom: space.xxl * 2 }}
        ListHeaderComponent={
          <View>
            <Row wrap style={{ paddingHorizontal: space.lg, marginTop: space.lg, gap: space.sm }}>
              {SCOPES.map(([s, icon]) => (
                <Chip key={s} icon={icon as never} label={t(`weekend.scope.${s}` as TKey)} color={colors.weekend} selected={scope === s} onPress={() => setScope(s)} />
              ))}
            </Row>
            {scope === 'near' ? (
            <>
            <View style={styles.searchRow}>
              <MaterialCommunityIcons name="map-search-outline" size={20} color={colors.weekend} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('weekend.placePlaceholder')}
                placeholderTextColor={colors.muted}
                value={place}
                onChangeText={setPlace}
                onSubmitEditing={searchPlace}
                returnKeyType="search"
                ref={placeInput as never}
              />
              <IconButton icon="crosshairs-gps" color={colors.weekend} label={t('weekend.nearMe')} onPress={() => { setPlace(''); setRadiusKm(config.defaultEventRadiusKm); currentLocation().then((h) => h && run({ center: h, radius: config.defaultEventRadiusKm })); }} />
            </View>
            <Row style={styles.whereRow}>
              <MaterialCommunityIcons name="map-marker-radius" size={20} color={colors.weekend} />
              <Text style={[font.body, { flex: 1, color: colors.weekend, fontWeight: '600' }]} numberOfLines={2}>
                {result?.centerName ? t('weekend.near', { place: result.centerName }) : t('weekend.nearUnknown')}
              </Text>
              <Button small outline color={colors.weekend} label={t('weekend.change')} onPress={() => placeInput.current?.focus()} />
            </Row>
            {onEmulatorDefault ? <Text style={[font.small, { marginHorizontal: space.lg, marginBottom: space.sm }]}>{t('weekend.emulatorNote')}</Text> : null}
            </>
            ) : (
              <Text style={[font.body, { marginHorizontal: space.lg, marginVertical: space.sm, color: colors.weekend, fontWeight: '600' }]}>
                {picks == null ? t('weekend.updating') : picks.length ? t('weekend.weeklyNote', { n: picks.length }) : t('weekend.weeklyEmpty')}
              </Text>
            )}
            <View style={{ paddingHorizontal: space.lg }}>
              {scope === 'near' ? (
                <Row wrap>
                  {(['month', 'thisWeekend', 'nextWeekend'] as Window[]).map((w) => (
                    <Chip key={w} label={t(`weekend.window.${w}` as TKey)} color={colors.weekend} selected={win === w} onPress={() => setWin(w)} />
                  ))}
                </Row>
              ) : null}
              <FilterPanel value={filters} onChange={setFilters} countries={countries} showTypes color={colors.weekend} />
            </View>
            <View style={[styles.mapWrap, { backgroundColor: tintFor(colors.weekend).surface }]}>
              <EventsMap
                key={scope}
                mapRef={mapRef}
                events={visible}
                center={scope === 'near' ? (center ?? DEFAULT_CENTER) : scope === 'israel' ? ISRAEL_CENTER : null}
                radiusKm={scope === 'israel' ? 160 : radiusKm}
                onRegionChangeComplete={onRegionChangeComplete}
                onPinPress={onPinPress}
              />
              {scope === 'near' && movedTo && config.hasGoogleMapsKey ? (
                <Pressable
                  style={styles.searchHere}
                  onPress={() => {
                    const r = Math.min(150, Math.max(10, Math.round(movedTo.latitudeDelta * 111 * 0.6)));
                    setRadiusKm(r);
                    setMovedTo(null);
                    run({ center: new Location(movedTo.latitude, movedTo.longitude), radius: r });
                  }}
                >
                  <MaterialCommunityIcons name="refresh" size={16} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{t('weekend.searchArea')}</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={{ paddingHorizontal: space.lg }}>
              <Text style={[font.small, { marginVertical: space.sm }]}>
                {visible.length ? t('weekend.tapPin') : t('weekend.mapEmpty')}
                {scope === 'near' && result?.mode === 'offline' ? ` · ${t('common.offline')}` : ''}
                {scope === 'near' && status ? ` · ${status}` : ''}
              </Text>
              {scope === 'near' && loading ? (
                <Row style={{ marginTop: space.sm }}>
                  <ActivityIndicator size="small" color={colors.weekend} />
                  <Text style={font.small}>{t('weekend.updating')}</Text>
                </Row>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={(scope === 'near' ? loading : picks == null) ? null : <Empty text={t('common.noResults')} icon="party-popper" />}
        renderItem={({ item }) => <EventCard event={item} />}
        onScrollToIndexFailed={() => undefined}
      />
    </Screen>
  );
}

/**
 * A purple EventElement card. Closed: photo, name, when and price. Open (tap): the description,
 * the venue, the source, and official page / where to book / I'm going.
 */
export function EventCard({ event: e }: { event: Event }) {
  const { t, dateRange, price } = useI18n();
  const card = useCardStyle();
  const lists = useLists();
  const [open, setOpen] = useState(false);
  const fav = lists.has('favouriteEvents', e.id);
  const going = lists.has('bookedEvents', e.id);
  const el = e.toElement();

  /**
   * "I'm going": marked at once on the phone (kept there until the server has it, like a heart),
   * the event kept on the phone for the profile, and the server told in the background (it keeps a
   * copy of the event and tells friends).
   */
  const toggleGoing = async () => {
    const on = await lists.toggle('bookedEvents', e.id); // asks to sign in when needed
    if (on == null) return;
    if (on) {
      void rememberEvent(e.toJSON());
      toast(t('weekend.goingSaved'));
    }
    api.setGoing({ eventId: e.id, going: on, event: e.toJSON() }).catch(() => undefined);
  };
  const toggleFav = async () => {
    const on = await lists.toggle('favouriteEvents', e.id);
    if (on) {
      void rememberEvent(e.toJSON());
      if (e.origin !== 'curated') api.saveEvent({ event: e.toJSON() }).catch(() => undefined);
    }
  };

  const C = colors.weekend;
  return (
    <View style={[ui.card, card, { marginHorizontal: space.lg }]}>
      <PhotoCarousel photos={el.photos} sources={e.photoSources} itemId={e.id} height={170} />
      <PressableScale onPress={() => setOpen(!open)} accessibilityState={{ expanded: open }} accessibilityLabel={`${el.name}. ${dateRange(e.startDate, e.endDate)}`}>
        <View style={{ padding: space.lg, paddingBottom: space.sm }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <Text style={[font.h2, { flex: 1 }]}>{el.name}</Text>
            <IconButton icon={fav ? 'heart' : 'heart-outline'} color={C} label={fav ? t('common.unfavourite') : t('common.favourite')} onPress={toggleFav} />
          </Row>
          <Row wrap style={{ marginTop: space.xs }}>
            <Badge text={dateRange(e.startDate, e.endDate)} color={C} icon="calendar" />
            {e.startTime ? <Badge text={e.endTime ? t('weekend.time', { start: e.startTime, end: e.endTime }) : e.startTime} color={C} icon="clock-outline" /> : null}
            <Badge text={e.price === 0 ? t('common.free') : e.price != null ? t('common.fromPrice', { price: price(e.price) }) : t('common.priceOnSite')} color={C} icon="tag" />
          </Row>
          {!e.datesConfirmed ? <Badge text={t('weekend.datesTbc')} color={colors.danger} icon="alert-circle-outline" /> : null}
          <Row style={{ justifyContent: 'space-between', marginTop: space.sm, minHeight: 44 }}>
            <Text style={[font.body, { color: C, fontWeight: '500' }]}>{open ? t('common.less') : t('common.more')}</Text>
            <Chevron open={open} color={C} />
          </Row>
        </View>
      </PressableScale>
      <Collapsible open={open}>
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
          <Row wrap>
            {e.types.slice(0, 3).map((ty) => (
              <Badge key={ty} text={t(`type.${ty}` as TKey)} color={C} />
            ))}
          </Row>
          <Text style={[font.body, { marginTop: space.sm }]}>{el.description}</Text>
          <Row style={{ marginTop: space.sm, alignItems: 'flex-start' }}>
            <MaterialCommunityIcons name="map-marker" size={18} color={C} />
            <Text style={[font.small, { flex: 1 }]}>{`${e.venue} · ${e.address}`}</Text>
          </Row>
          {e.priceText ? <Text style={[font.small, { marginTop: 4 }]}>{e.priceText}</Text> : null}
          <Text style={[font.small, { marginTop: 4, fontStyle: 'italic' }]}>{t('weekend.sourceName', { name: e.sourceName })}</Text>
          <View style={{ marginTop: space.md, gap: space.sm }}>
            <Button label={t('weekend.officialPage')} color={C} icon="open-in-new" onPress={() => openLink(el.link)} />
            {e.bookingLink && e.bookingLink !== el.link ? (
              <Button outline label={t('weekend.whereToBook')} color={C} icon="ticket-outline" onPress={() => openLink(e.bookingLink)} />
            ) : null}
            <Button outline={!going} label={going ? t('weekend.notGoing') : t('weekend.going')} color={C} icon={going ? 'check' : 'account-multiple-plus'} onPress={toggleGoing} />
          </View>
        </View>
      </Collapsible>
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, margin: space.lg, marginBottom: space.sm, backgroundColor: tintFor(colors.weekend).field, borderWidth: 1.5, borderColor: tintFor(colors.weekend).line, borderRadius: 16, paddingHorizontal: space.md, minHeight: 56 },
  whereRow: { marginHorizontal: space.lg, marginBottom: space.sm, gap: space.sm },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: colors.text },
  mapWrap: { height: 320, marginHorizontal: space.lg, borderRadius: radius.lg, overflow: 'hidden' },
  searchHere: { position: 'absolute', top: 10, alignSelf: 'center', flexDirection: 'row', gap: 6, alignItems: 'center', minHeight: 44, backgroundColor: colors.weekend, paddingHorizontal: 18, paddingVertical: 10, borderRadius: radius.pill },
});
