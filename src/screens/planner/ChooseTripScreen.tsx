import React, { useEffect, useRef, useState } from 'react';
import { Modal, View } from 'react-native';
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
import { Attraction, DISABILITIES, Event, EventType, MODE_CAR, MODE_PUBLIC_TRANSPORT, ModeOfTravel, VERIFIABLE_NEEDS, pacingFor } from '../../models';
import type { RootParams } from '../../navigation/types';
import { PlannerError, PlannerStep, addDays, generateTrip } from '../../planner/generator';
import { NotConfiguredError } from '../../services/api';
import { DEFAULT_DAY_END, DEFAULT_DAY_START } from '../../planner/time';
import { api, warmUp } from '../../services/api';
import { eventsByIds } from '../../services/eventService';
import { appProviders, resetSourceNotes } from '../../services/plannerProviders';
import { putTrip } from '../../services/tripStore';
import { colors, font, radius, space } from '../../theme';

const STEPS: PlannerStep[] = ['geocode', 'attractions', 'events', 'food', 'routes', 'kids'];

/** "Choose your trip": everything the trip builder needs, then it builds the day-by-day plan. */
export function ChooseTripScreen() {
  const { t, lang, dateRange, clock } = useI18n();
  const { firebaseUser, profile } = useAuth();
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  const today = new Date();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sameCity, setSameCity] = useState(true);
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
  const [favEvents, setFavEvents] = useState<Event[]>([]);
  const [mustDo, setMustDo] = useState<Event[]>([]);
  const [step, setStep] = useState<PlannerStep | null>(null);
  /** Accessibility needs: empty unless someone in the group needs it (then each is used on its own). */
  const [needs, setNeeds] = useState<string[]>([]);
  const [strictAccess, setStrictAccess] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  /** Each build gets a number; Cancel moves it on, so a build that finishes later is ignored. */
  const buildId = useRef(0);

  useEffect(() => {
    if (profile?.favouriteEvents?.length) eventsByIds(profile.favouriteEvents, lang).then(setFavEvents);
  }, [profile?.favouriteEvents, lang]);

  // Wake the planner's server functions while the form is being filled in (see api.ts warmUp).
  useEffect(() => nav.addListener('focus', warmUp), [nav]);

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

  const findMustSee = async () => {
    if (!mustSeeQuery.trim()) return;
    try {
      const r = await api.placeSearch({ query: `${mustSeeQuery} ${from}`.trim(), lang });
      setMustSeeResults(r.items.map(Attraction.fromJSON));
    } catch {
      toast(t('common.error'));
    }
  };

  const build = async () => {
    if (!from.trim()) return toast(t('planner.err.city', { city: '…' }));
    if (!start || !end) return toast(t('planner.err.dates'));
    const id = ++buildId.current;
    const stillWanted = () => id === buildId.current;
    setStep('geocode');
    resetSourceNotes();
    try {
      const trip = await generateTrip(
        {
          startingPoint: from.trim(),
          endingPoint: sameCity ? '' : to.trim(),
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
          mustDo,
          lang,
          ownerId: firebaseUser?.uid ?? '',
          people: firebaseUser ? [firebaseUser.uid] : [],
          accessNeeds: needs,
          accessStrict: strictAccess,
        },
        appProviders,
        (s) => stillWanted() && setStep(s),
      );
      if (!stillWanted()) return; // cancelled
      setStep(null);
      nav.navigate('TripPlan', { tripId: putTrip(trip) });
    } catch (e) {
      if (!stillWanted()) return;
      setStep(null);
      if (e instanceof PlannerError) toast(t(`planner.err.${e.code}` as TKey, e.params));
      else if (e instanceof NotConfiguredError) toast(t('planner.err.noServer'));
      else toast(t('common.error'));
    }
  };

  const C = colors.planner;
  const tripEvents = favEvents.filter((e) => start && end && e.overlaps(start, end));

  return (
    <Screen title={t('planner.title')} subtitle={t('planner.subtitle')} accent={C}>
      <Accordion title={t('planner.where')} summary={from.trim() ? (sameCity || !to.trim() ? from : `${from} → ${to}`) : t('planner.whereSummary')} icon="map-marker-outline" color={C} defaultOpen>
        <Field label={t('planner.from')} placeholder={t('planner.cityPlaceholder')} value={from} onChangeText={setFrom} />
        <Toggle label={t('planner.sameCity')} value={sameCity} onChange={setSameCity} color={C} />
        {!sameCity ? <Field label={t('planner.to')} placeholder={t('planner.cityPlaceholder')} value={to} onChangeText={setTo} /> : null}
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
        summary={mustSee.length || mustDo.length ? t('planner.mustSeeCount', { n: mustSee.length + mustDo.length }) : t('planner.nothingYet')}
        icon="star-outline"
        color={C}
      >
        <Row>
          <View style={{ flex: 1 }}>
            <Field label="" placeholder={t('planner.mustSeePlaceholder')} value={mustSeeQuery} onChangeText={setMustSeeQuery} onSubmitEditing={findMustSee} />
          </View>
          <Button small label={t('planner.add')} color={C} icon="magnify" onPress={findMustSee} />
        </Row>
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
