import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, View } from 'react-native';
import { Text } from '../../components/Text';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Accordion } from '../../components/Accordion';
import { DateField } from '../../components/DateField';
import { TimeRangeSlider } from '../../components/TimeRangeSlider';
import { TypePicker } from '../../components/TypePicker';
import { tintFor } from '../../components/Tint';
import { Button, Chip, Field, IconButton, Row, Screen, Section, Stepper, Toggle, toast } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import type { TKey } from '../../i18n';
import { Attraction, DISABILITIES, Event, EventType, Location, MODE_CAR, isoDay, MODE_PUBLIC_TRANSPORT, ModeOfTravel, VERIFIABLE_NEEDS, pacingFor } from '../../models';
import { haversineKm } from '../../planner/geo';
import type { RootParams } from '../../navigation/types';
import { PickedPlace, PlannerError, PlannerStep, addDays, generateTrip, skippedDestinations } from '../../planner/generator';
import { PlaceField } from '../../components/PlaceField';
import { tripEnds } from '../../planner/destinations';
import type { TripStyle } from '../../planner/route';
import { prefetchBackup } from '../../services/attractionBackup';
import { NotConfiguredError } from '../../services/api';
import { DEFAULT_DAY_END, DEFAULT_DAY_START } from '../../planner/time';
import { api, warmUp } from '../../services/api';
import { eventsByIds, knownEvents } from '../../services/eventService';
import { currentLocation } from '../../services/location';
import { Hotspot, eventHotspots } from '../../planner/anywhere';
import { appProviders, resetSourceNotes, sourcesSummary } from '../../services/plannerProviders';
import { putTrip } from '../../services/tripStore';
import { colors, font, radius, space } from '../../theme';

const STEPS: PlannerStep[] = ['geocode', 'attractions', 'events', 'food', 'routes', 'details', 'kids'];

/** "Choose your trip": everything the trip builder needs, then it builds the day-by-day plan. */
export function ChooseTripScreen() {
  const { t, lang, dateRange, clock } = useI18n();
  const { firebaseUser, profile } = useAuth();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const today = new Date();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fromPick, setFromPick] = useState<PickedPlace | undefined>();
  const [toPick, setToPick] = useState<PickedPlace | undefined>();
  /** Off by default: the Destination field is always shown (empty = a round trip from the start). */
  const [backHome, setBackHome] = useState(false);
  /** "Add more destinations": destinations visited in this order before the final destination. */
  const [moreTo, setMoreTo] = useState<Array<{ key: number; text: string; pick?: PickedPlace }>>([]);
  const nextKey = useRef(1);
  /** Popular places (default) or off the beaten track: which stops and sights come first. */
  const [style, setStyle] = useState<TripStyle>('popular');
  const [adults, setAdults] = useState(2);
  const [kids, setKids] = useState(0);
  const [types, setTypes] = useState<EventType[]>(['History', 'Nature']);
  const [start, setStart] = useState<Date | undefined>(addDays(today, 7));
  const [end, setEnd] = useState<Date | undefined>(addDays(today, 9));
  const [withEvents, setWithEvents] = useState(true);
  const [kidFriendly, setKidFriendly] = useState(false);
  const [mode, setMode] = useState<ModeOfTravel>(MODE_CAR);
  const [dayStart, setDayStart] = useState(DEFAULT_DAY_START);
  const [dayEnd, setDayEnd] = useState(DEFAULT_DAY_END);
  const [mustSeeQuery, setMustSeeQuery] = useState('');
  const [mustSeeResults, setMustSeeResults] = useState<Attraction[]>([]);
  const [mustSee, setMustSee] = useState<Attraction[]>([]);
  /** Towns the route must pass through (from the same search). */
  const [mustStops, setMustStops] = useState<PickedPlace[]>([]);
  const [townResult, setTownResult] = useState<PickedPlace | null>(null);
  const [mustSearching, setMustSearching] = useState(false);
  const [mustNone, setMustNone] = useState('');
  const [favEvents, setFavEvents] = useState<Event[]>([]);
  const [mustDo, setMustDo] = useState<Event[]>([]);
  const [step, setStep] = useState<PlannerStep | null>(null);
  /** Accessibility needs: empty unless someone in the group needs it (then each is used on its own). */
  const [needs, setNeeds] = useState<string[]>([]);
  // Off by default: confirmed places come first and every place says what is confirmed. Few
  // venues publish accessibility information (in Morocco hardly any), so "only confirmed
  // places" often finds none; then the planner asks before giving up.
  const [strictAccess, setStrictAccess] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  /** "Take me anywhere": the liveliest places around, or 'loading' while they are found. */
  const [anywhere, setAnywhere] = useState<Hotspot[] | 'loading' | null>(null);
  /** Each build gets a number; Cancel moves it on, so a build that finishes later is ignored. */
  const buildId = useRef(0);

  useEffect(() => {
    if (profile?.favouriteEvents?.length) eventsByIds(profile.favouriteEvents, lang).then(setFavEvents);
  }, [profile?.favouriteEvents, lang]);

  // Wake the planner's server functions while the form is being filled in (see api.ts warmUp).
  useEffect(
    () =>
      nav.addListener('focus', () => {
        warmUp();
        prefetchBackup(); // the attraction list on the phone, ready before "Build my trip"
      }),
    [nav],
  );

  // Seconds since "Build my trip" was pressed, shown in the progress window.
  const building = step !== null;
  useEffect(() => {
    if (!building) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [building]);

  const cancel = () => {
    buildId.current++;
    setStep(null);
  };

  /** Places within 1,500 km of the traveller with the most events on the chosen dates. */
  /**
   * From the starting city when one is chosen (the trip starts there), else where the phone is.
   * Events: the ones on the phone (weekly list, hand-checked, uploads) and Ticketmaster's within
   * 1,500 km. Towns with 3+ events first; if none has that many, the towns with any.
   */
  const takeMeAnywhere = async () => {
    if (!start || !end) return toast(t('planner.anywhereNoDates'));
    setAnywhere('loading');
    setAnywhereFrom('');
    const here = fromPick?.location ?? (await currentLocation().catch(() => null));
    if (!here) {
      setAnywhere(null);
      return toast(t('planner.anywhereNoLocation'));
    }
    const day = (d: Date) => isoDay(d);
    const [known, around, hereName] = await Promise.all([
      knownEvents(lang).catch(() => [] as Event[]),
      api
        .eventsAround({ lat: here.locLat, lon: here.locLon, from: day(start), to: day(end), lang })
        .then((r) => r.events.map(Event.fromJSON))
        .catch(() => [] as Event[]),
      fromPick ? Promise.resolve(fromPick.name) : api.reverseGeocode({ lat: here.locLat, lon: here.locLon, lang }).then((r) => r.name).catch(() => ''),
    ]);
    const all = [...known, ...around];
    const opts = { types, familyTrip: kids > 0 };
    let list = eventHotspots(all, here, start, end, opts);
    if (!list.length) list = eventHotspots(all, here, start, end, { ...opts, minEvents: 1 });
    setAnywhere(list);
    setAnywhereFrom(hereName);
    if (!list.length) toast(t('planner.anywhereNone2', { place: hereName || '…', n: all.filter((e) => e.overlaps(start, end)).length }));
  };
  const [anywhereFrom, setAnywhereFrom] = useState('');
  const goThere = (h: Hotspot) => {
    setFrom(h.name);
    setFromPick({ name: h.name, location: h.location, country: h.country });
    // A round trip around the place found: no destinations.
    setTo('');
    setToPick(undefined);
    setMoreTo([]);
    setWithEvents(true);
    setAnywhere(null);
  };

  /**
   * Must-see search: places to visit (Tripadvisor, nearest to the trip's start first; with the
   * start city added when the name alone finds nothing) and, at the same time, the town of that
   * name, which can be added as a stop on the route ("Tbilisi", "Luang Prabang").
   */
  const findMustSee = async () => {
    const q = mustSeeQuery.trim();
    if (!q || mustSearching) return;
    setMustSearching(true);
    setMustNone('');
    setTownResult(null);
    try {
      const near = fromPick ? { lat: fromPick.location.locLat, lon: fromPick.location.locLon } : {};
      const [places, town] = await Promise.all([
        api
          .placeSearch({ query: q, lang, ...near })
          .then(async (r) => (r.items.length || !from.trim() ? r : api.placeSearch({ query: `${q} ${from}`.trim(), lang, ...near })))
          .then((r) => r.items.map(Attraction.fromJSON))
          .catch(() => [] as Attraction[]),
        api.geocode({ query: q, lang }).catch(() => null),
      ]);
      setMustSeeResults(places);
      const townPick = town ? { name: town.name || q, location: new Location(town.lat, town.lon), country: town.country } : null;
      // A town is offered unless a found place is right there (then the place is the better pick).
      setTownResult(townPick && !places.some((a) => haversineKm(a.location, townPick.location) < 2) ? townPick : null);
      if (!places.length && !townPick) setMustNone(q);
    } finally {
      setMustSearching(false);
    }
  };

  const build = async () => {
    if (!from.trim()) return toast(t('planner.err.city', { city: '…' }));
    if (!start || !end) return toast(t('planner.err.dates'));
    const id = ++buildId.current;
    const stillWanted = () => id === buildId.current;
    const ends = tripEnds(moreTo, { text: to, pick: toPick }, backHome);
    setStep('geocode');
    resetSourceNotes();
    let declined = false;
    const planWithoutConfirmation = (chosen: string[]) =>
      new Promise<boolean>((resolve) => {
        if (!stillWanted()) return resolve(false);
        const answer = (yes: boolean) => {
          declined = !yes;
          resolve(yes);
        };
        Alert.alert(
          t('planner.accessNone.title'),
          t('planner.accessNone.body', { needs: chosen.map((n) => t(`access.${n}` as TKey)).join(', ') }),
          [
            { text: t('common.cancel'), style: 'cancel', onPress: () => answer(false) },
            { text: t('planner.accessNone.planAnyway'), onPress: () => answer(true) },
          ],
          { cancelable: true, onDismiss: () => answer(false) },
        );
      });
    try {
      const trip = await generateTrip(
        {
          startingPoint: from.trim(),
          endingPoint: ends.endingPoint,
          startPick: fromPick,
          endPick: ends.endPick,
          destinations: ends.destinations,
          numAdults: adults,
          numKids: kids,
          types,
          startDate: start,
          endDate: end,
          withEvents,
          kidFriendly,
          mode,
          dayStart,
          dayEnd,
          mustSee,
          mustStops,
          mustDo,
          lang,
          ownerId: firebaseUser?.uid ?? '',
          people: firebaseUser ? [firebaseUser.uid] : [],
          accessNeeds: needs,
          accessStrict: strictAccess,
          style,
        },
        appProviders,
        (s) => stillWanted() && setStep(s),
        undefined,
        { planWithoutConfirmation },
      );
      if (!stillWanted()) return; // cancelled
      setStep(null);
      nav.navigate('TripPlan', { tripId: putTrip(trip) });
      // Destinations the days couldn't fit: said at once (the plan also shows it at the top).
      const skipped = skippedDestinations(trip.notes);
      if (skipped.length) Alert.alert(t('planner.generate'), t('plan.destSkipped', { names: skipped.join(', ') }));
    } catch (e) {
      if (!stillWanted()) return;
      setStep(null);
      if (declined && e instanceof PlannerError && e.code === 'noAccessible') return; // they chose not to
      if (e instanceof PlannerError && (e.code === 'noAttractions' || e.code === 'nothingFound')) {
        // The whole message, and what each source answered (a screenshot then says why).
        Alert.alert(t('planner.generate'), `${t(`planner.err.${e.code}` as TKey, e.params)}\n\n${sourcesSummary()}`);
      } else if (e instanceof PlannerError) toast(t(`planner.err.${e.code}` as TKey, e.params));
      else if (e instanceof NotConfiguredError) toast(t('planner.err.noServer'));
      else toast(t('common.error'));
    }
  };

  const C = colors.planner;
  const route = [from.trim(), ...moreTo.map((d) => d.text.trim()), to.trim()].filter(Boolean);
  const whereSummary = !from.trim()
    ? t('planner.whereSummary')
    : [...route, ...((backHome || !to.trim()) && route.length > 1 ? [from.trim()] : [])].join(' → ');
  const tripEvents = favEvents.filter((e) => start && end && e.overlaps(start, end));

  return (
    <Screen title={t('planner.title')} subtitle={t('planner.subtitle')} accent={C}>
      <Accordion title={t('planner.where')} summary={whereSummary} icon="map-marker-outline" color={C} defaultOpen>
        <PlaceField label={t('planner.from')} placeholder={t('planner.cityPlaceholder')} value={from} onChangeText={setFrom} picked={fromPick} onPick={setFromPick} color={C} />
        {moreTo.map((d, k) => (
          <View key={d.key}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={[font.small, { fontWeight: '600', color: colors.text }]}>{t('planner.toN', { n: k + 1 })}</Text>
              <IconButton icon="close" label={t('common.remove')} onPress={() => setMoreTo(moreTo.filter((x) => x.key !== d.key))} />
            </Row>
            <PlaceField
              label=""
              placeholder={t('planner.cityPlaceholder')}
              value={d.text}
              onChangeText={(text) => setMoreTo((list) => list.map((x) => (x.key === d.key ? { ...x, text } : x)))}
              picked={d.pick}
              onPick={(pick) => setMoreTo((list) => list.map((x) => (x.key === d.key ? { ...x, pick } : x)))}
              color={C}
            />
          </View>
        ))}
        {/* The trip ends here (or, with "come back" on, this is the last destination before home). */}
        <PlaceField
          label={backHome ? t('planner.toN', { n: moreTo.length + 1 }) : t('planner.finalDestination')}
          placeholder={t('planner.toPlaceholder')}
          value={to}
          onChangeText={setTo}
          picked={toPick}
          onPick={setToPick}
          color={C}
        />
        <Button
          small
          outline
          label={t('planner.addDestination')}
          icon="plus"
          color={C}
          onPress={() => setMoreTo([...moreTo, { key: nextKey.current++, text: '' }])}
          style={{ alignSelf: 'flex-start' }}
        />
        <Text style={[font.small, { marginTop: 4 }]}>{t('planner.toHint')}</Text>
        <Toggle label={t('planner.sameCity')} value={backHome} onChange={setBackHome} color={C} />
        {backHome || !to.trim() ? <Text style={font.small}>{t('planner.endsAtStart', { city: from.trim() || '…' })}</Text> : null}
        <Text style={[font.small, { marginTop: space.md, fontWeight: '600', color: colors.text }]}>{t('planner.style')}</Text>
        <Row>
          <Chip label={t('planner.popular')} icon="star-outline" color={C} selected={style === 'popular'} onPress={() => setStyle('popular')} />
          <Chip label={t('planner.offbeat')} icon="compass-rose" color={C} selected={style === 'offbeat'} onPress={() => setStyle('offbeat')} />
        </Row>
        <Text style={font.small}>{t(style === 'offbeat' ? 'planner.styleHint.offbeat' : 'planner.styleHint.popular')}</Text>
        <Button small outline label={t('planner.anywhere')} icon="compass-outline" color={C} onPress={takeMeAnywhere} style={{ marginTop: space.md, alignSelf: 'flex-start' }} />
        <Text style={[font.small, { marginTop: 4 }]}>{t('planner.anywhereHint')}</Text>
        {anywhere === 'loading' ? (
          <Row style={{ marginTop: space.sm }}>
            <ActivityIndicator color={C} />
            <Text style={font.small}>{t('planner.anywhereSearching')}</Text>
          </Row>
        ) : anywhere?.length ? (
          <View style={{ marginTop: space.sm }}>
            {anywhereFrom ? <Text style={[font.small, { marginBottom: space.xs }]}>{t('planner.anywhereFrom', { place: anywhereFrom })}</Text> : null}
            {anywhere.map((h) => (
              <Pressable
                key={`${h.name}:${h.country}`}
                onPress={() => goThere(h)}
                accessibilityRole="button"
                style={{ borderWidth: 1.5, borderColor: tintFor(C).line, backgroundColor: tintFor(C).field, borderRadius: radius.md, padding: space.md, marginBottom: space.sm }}
              >
                <Row>
                  <MaterialCommunityIcons name="map-marker-star-outline" size={20} color={C} />
                  <Text style={[font.h3, { flex: 1, color: C }]}>{h.name}</Text>
                </Row>
                <Text style={font.small}>{t('planner.anywhereEvents', { n: h.events.length, km: h.km })}</Text>
                <Text style={font.small} numberOfLines={2}>
                  {h.events.slice(0, 3).map((e) => e.name).join(' · ')}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </Accordion>

      <Accordion title={t('planner.travellers')} summary={t('planner.whoSummary', { adults, kids })} icon="account-group-outline" color={C}>
        <Stepper label={t('planner.adults')} value={adults} onChange={setAdults} min={1} />
        <Stepper label={t('planner.kids')} value={kids} onChange={setKids} />
      </Accordion>

      <Accordion
        title={t('planner.dates')}
        summary={start && end ? `${dateRange(start, end)} · ${clock(dayStart)}–${clock(dayEnd)}` : t('planner.nothingYet')}
        icon="calendar-range"
        color={C}
      >
        <Row>
          <DateField label={t('common.from')} value={start} onChange={(d) => { setStart(d); if (d && end && end < d) setEnd(d); }} min={today} color={C} />
          <DateField label={t('common.to')} value={end} onChange={setEnd} min={start ?? today} color={C} />
        </Row>
        <Text style={[font.small, { marginTop: space.sm }]}>{t('planner.dayTime')}</Text>
        <TimeRangeSlider start={dayStart} end={dayEnd} onChange={(s, e) => { setDayStart(s); setDayEnd(e); }} color={C} />
      </Accordion>

      <Accordion title={t('planner.types')} summary={types.map((ty) => t(`type.${ty}` as TKey)).join(', ') || t('planner.nothingYet')} icon="heart-outline" color={C}>
        <TypePicker value={types} onChange={setTypes} color={C} />
        <Toggle label={t('planner.withEvents')} value={withEvents} onChange={setWithEvents} color={C} />
        <Toggle label={t('planner.kidFriendly')} value={kidFriendly} onChange={setKidFriendly} color={C} />
      </Accordion>

      <Accordion title={t('planner.mode')} summary={mode === MODE_CAR ? t('planner.car') : t('planner.transit')} icon={mode === MODE_CAR ? 'car' : 'bus'} color={C}>
        <Row>
          <Chip label={t('planner.car')} icon="car" color={C} selected={mode === MODE_CAR} onPress={() => setMode(MODE_CAR)} />
          <Chip label={t('planner.transit')} icon="bus" color={C} selected={mode === MODE_PUBLIC_TRANSPORT} onPress={() => setMode(MODE_PUBLIC_TRANSPORT)} />
        </Row>
      </Accordion>

      <Accordion
        title={t('access.title')}
        summary={needs.length ? needs.map((n) => t(`access.${n}` as TKey)).join(', ') : t('access.none')}
        icon="wheelchair-accessibility"
        color={C}
      >
        <Text style={[font.small, { marginBottom: space.sm }]}>{t('access.tripIntro')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {DISABILITIES.map((n) => (
            <Chip
              key={n}
              label={t(`access.${n}` as TKey)}
              color={C}
              selected={needs.includes(n)}
              onPress={() => setNeeds(needs.includes(n) ? needs.filter((x) => x !== n) : [...needs, n])}
            />
          ))}
        </View>
        {needs.some((n) => (VERIFIABLE_NEEDS as string[]).includes(n)) ? (
          <>
            <Toggle label={t('access.strict')} value={strictAccess} onChange={setStrictAccess} color={C} />
            {strictAccess ? <Text style={font.small}>{t('access.strictHint')}</Text> : null}
          </>
        ) : null}
        {needs.length ? (
          <Text style={[font.small, { marginTop: space.sm }]}>
            {t('access.pace', { n: pacingFor(needs).maxPerDay ?? 0, m: pacingFor(needs).breakMinutes })}
          </Text>
        ) : null}
      </Accordion>

      <Accordion
        title={t('planner.mustSee')}
        summary={mustSee.length || mustDo.length || mustStops.length ? t('planner.mustSeeCount', { n: mustSee.length + mustDo.length + mustStops.length }) : t('planner.nothingYet')}
        icon="star-outline"
        color={C}
      >
        <Row>
          <View style={{ flex: 1 }}>
            <Field label="" placeholder={t('planner.mustSeePlaceholder')} value={mustSeeQuery} onChangeText={setMustSeeQuery} onSubmitEditing={findMustSee} />
          </View>
          <Button small label={t('planner.add')} color={C} icon="magnify" onPress={findMustSee} loading={mustSearching} />
        </Row>
        {mustNone ? <Text style={[font.small, { marginTop: space.sm }]}>{t('planner.mustSeeNone', { q: mustNone })}</Text> : null}
        {townResult && !mustStops.some((m) => m.name === townResult.name) ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Chip
              icon="map-marker-plus-outline"
              label={t('planner.mustStop', { name: townResult.name })}
              color={C}
              onPress={() => {
                setMustStops([...mustStops, townResult]);
                setTownResult(null);
              }}
            />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {mustSeeResults.map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              color={C}
              selected={mustSee.some((m) => m.id === a.id)}
              onPress={() => setMustSee(mustSee.some((m) => m.id === a.id) ? mustSee.filter((m) => m.id !== a.id) : [...mustSee, a])}
            />
          ))}
        </View>
        {mustStops.map((m) => (
          <Row key={`stop-${m.name}`}>
            <MaterialCommunityIcons name="map-marker" size={18} color={C} />
            <Text style={[font.body, { flex: 1 }]}>{t('planner.mustStopChosen', { name: m.name })}</Text>
            <IconButton icon="close" label={t('common.remove')} onPress={() => setMustStops(mustStops.filter((x) => x !== m))} />
          </Row>
        ))}
        {mustSee.map((a) => (
          <Row key={a.id}>
            <MaterialCommunityIcons name="star" size={18} color={C} />
            <Text style={[font.body, { flex: 1 }]}>{a.name}</Text>
            <IconButton icon="close" label={t('common.remove')} onPress={() => setMustSee(mustSee.filter((m) => m.id !== a.id))} />
          </Row>
        ))}
        {tripEvents.length ? (
          <>
            <Text style={[font.small, { marginTop: space.md }]}>{t('user.favouriteEvents')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {tripEvents.map((e) => (
                <Chip key={e.id} icon="party-popper" label={e.name} color={colors.event} selected={mustDo.some((m) => m.id === e.id)} onPress={() => setMustDo(mustDo.some((m) => m.id === e.id) ? mustDo.filter((m) => m.id !== e.id) : [...mustDo, e])} />
              ))}
            </View>
          </>
        ) : null}
      </Accordion>

      <Button label={t('planner.generate')} color={C} icon="map-marker-path" onPress={build} style={{ marginTop: space.xl }} />

      <Modal visible={!!step} transparent animationType="fade" onRequestClose={cancel}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: space.xl }}>
          <View style={{ backgroundColor: tintFor(C).page, borderColor: tintFor(C).line, borderWidth: 1, borderRadius: 24, padding: space.xl }}>
            <Row style={{ marginBottom: space.md }}>
              <Text style={[font.h2, { flex: 1 }]}>{t('planner.generate')}</Text>
              <Text style={font.small}>{t('planner.elapsed', { s: elapsed })}</Text>
            </Row>
            {STEPS.filter((s) => s !== 'kids' || kids > 0).map((s) => {
              const idx = STEPS.indexOf(s);
              const cur = step ? STEPS.indexOf(step) : -1;
              const icon = idx < cur ? 'check-circle' : idx === cur ? 'progress-clock' : 'circle-outline';
              return (
                <Row key={s} style={{ marginBottom: 6 }}>
                  <MaterialCommunityIcons name={icon} size={20} color={idx <= cur ? C : colors.muted} />
                  <Text style={[font.body, { color: idx <= cur ? colors.text : colors.muted }]}>
                    {t((s === 'attractions' && needs.length ? 'planner.step.access' : `planner.step.${s}`) as TKey)}
                  </Text>
                </Row>
              );
            })}
            {elapsed >= 10 ? <Text style={[font.small, { marginTop: space.sm }]}>{t('planner.slowHint')}</Text> : null}
            <Button small outline label={t('common.cancel')} color={C} icon="close" onPress={cancel} style={{ marginTop: space.lg, alignSelf: 'flex-end' }} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
