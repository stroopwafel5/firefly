import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ReorderableList, { useReorderableDrag } from 'react-native-reorderable-list';
import { BackButton, Badge, Button, IconButton, Loading, Row, openLink, styles as ui, toast, useCardStyle } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useLists } from '../../hooks/useLists';
import { useI18n } from '../../i18n';
import type { TKey } from '../../i18n';
import { DayPlan, MODE_CAR, ScheduledItem, Trip, VERIFIABLE_NEEDS, attractionEmoji, pacingFor, popularityOf } from '../../models';
import type { RootScreen } from '../../navigation/types';
import { moveToDay, reorder, removeItem } from '../../planner/dayEdit';
import { skippedDestinations } from '../../planner/generator';
import { describeHours } from '../../planner/time';
import { AreaWarning, parseAreaNote } from '../../planner/safety';
import { saveTrip, updateTrip } from '../../services/tripService';
import { rememberPlace } from '../../services/placeStore';
import { errorCode } from '../../services/userService';
import { isSaved, loadTrip, markSaved, putTrip } from '../../services/tripStore';
import { SectionBackdrop } from '../../components/DuskScene';
import { TintProvider, tintFor } from '../../components/Tint';
import { PressableScale } from '../../components/Accordion';
import { DayMapCard, RouteCard } from './TripMaps';
import { colors, font, radius, space } from '../../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Day-by-day plan. Teal for the trip plan; pink for the kids' plan (family trips only), where
 * descriptions come from kid-friendly sources and each place has a sourced fun fact.
 * Attractions can be dragged to new times — the move is refused (with the reason) when it
 * would break opening hours, clash with a fixed-time event or run past the end of the day.
 */
export function TripPlanScreen({ route, navigation }: RootScreen<'TripPlan'>) {
  const { t, date } = useI18n();
  const insets = useSafeAreaInsets();
  const { firebaseUser } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [dayIndex, setDayIndex] = useState(0);
  const [kidsMode, setKidsMode] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadTrip(route.params.tripId).then((tr) => {
      setTrip(tr);
      setSaved(isSaved(route.params.tripId));
    });
  }, [route.params.tripId]);

  const commit = useCallback(
    (next: Trip) => {
      putTrip(next);
      setTrip(Trip.fromJSON(next.toJSON()));
      if (saved) updateTrip(next).catch(() => toast(t('common.error')));
    },
    [saved, t],
  );

  if (!trip) return <Loading />;
  const day = trip.itinerary[dayIndex];
  const accent = kidsMode ? colors.kids : colors.planner;
  const soft = tintFor(accent).page;

  const setDay = (i: number, d: DayPlan) => {
    const next = Trip.fromJSON(trip.toJSON());
    next.itinerary[i] = d;
    commit(next);
  };

  const reasonText = (r: { reason: string; otherRefId?: string; at: number }) => {
    if (r.reason === 'overlap') {
      const other = day.findEvent(r.otherRefId ?? '')?.name ?? '';
      return t('plan.reason.overlap', { name: other });
    }
    if (r.reason === 'afterEnd') return t('plan.reason.afterEnd', { time: day.end });
    return t(`plan.reason.${r.reason}` as TKey);
  };

  const onSave = async () => {
    if (!firebaseUser || firebaseUser.isAnonymous) {
      toast(t('common.signInRequired'));
      navigation.navigate('SignIn');
      return;
    }
    try {
      trip.ownerId = trip.ownerId || firebaseUser.uid;
      await saveTrip(trip, firebaseUser.uid);
      markSaved(String(trip.id));
      setSaved(true);
      toast(t('plan.saved'));
    } catch (e) {
      toast(`${t('common.error')} (${errorCode(e)})`);
    }
  };

  const sorted = [...day.slots].sort((a, b) => a.start - b.start);

  return (
    <TintProvider accent={accent}>
    <View style={{ flex: 1, backgroundColor: soft }}>
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <SectionBackdrop accent={accent} />
        <Row>
          <BackButton onPress={() => navigation.goBack()} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{trip.name}</Text>
            <Text style={styles.subtitle}>{`${date(trip.startDate)} – ${date(trip.endDate)}`}</Text>
          </View>
          <IconButton icon={saved ? 'content-save-check' : 'content-save-outline'} color="#fff" label={t('plan.save')} onPress={onSave} />
          {saved ? <IconButton icon="account-multiple-plus" color="#fff" label={t('plan.addPeople')} onPress={() => navigation.navigate('FindPeople', { addToTripId: String(trip.id) })} /> : null}
        </Row>
        {trip.isFamilyTrip ? (
          <Row style={{ marginTop: space.sm }}>
            <HeaderChip label={t('plan.adultTab')} selected={!kidsMode} onPress={() => setKidsMode(false)} ink={accent} />
            <HeaderChip label={t('plan.kidsTab')} selected={kidsMode} onPress={() => setKidsMode(true)} ink={accent} />
          </Row>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.sm }} contentContainerStyle={{ gap: space.sm }}>
          {trip.itinerary.map((d, i) => (
            <HeaderChip
              key={d.id}
              label={`${t('plan.day', { n: i + 1 })} · ${d.anchorName}`}
              sub={date(d.date, { day: 'numeric', month: 'short' })}
              selected={i === dayIndex}
              onPress={() => setDayIndex(i)}
              ink={colors.attraction}
            />
          ))}
        </ScrollView>
      </View>

      <View style={[styles.sheet, { backgroundColor: soft }]}>
      <ReorderableList
        data={sorted}
        keyExtractor={(s) => s.key}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl * 3 }}
        onReorder={({ from, to }) => {
          const r = reorder(day, from, to, trip.ModeOfTravel);
          if ('day' in r) setDay(dayIndex, r.day);
          else {
            const name = day.findAttraction(r.error.refId)?.name ?? day.findRestaurant(r.error.refId)?.name ?? day.findEvent(r.error.refId)?.name ?? '';
            toast(t('plan.moveRejected', { name, reason: reasonText(r.error) }));
            setTrip(Trip.fromJSON(trip.toJSON())); // snap back
          }
        }}
        ListHeaderComponent={
          <View style={{ marginBottom: space.md }}>
            {trip.notes.includes('noAttractions') ? (
              <Row style={[styles.note, { borderColor: colors.danger }]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.danger} />
                <Text style={[font.small, { flex: 1, color: colors.danger }]}>{t('plan.note.noAttractions')}</Text>
              </Row>
            ) : trip.notes.includes('tripadvisorBusy') ? (
              <Row style={[styles.note, { borderColor: colors.attraction }]}>
                <MaterialCommunityIcons name="information-outline" size={20} color={colors.attraction} />
                <Text style={[font.small, { flex: 1, color: colors.attraction }]}>{t('plan.note.tripadvisorBusy')}</Text>
              </Row>
            ) : null}
            {skippedDestinations(trip.notes).length ? (
              <Row style={[styles.note, { borderColor: colors.danger }]}>
                <MaterialCommunityIcons name="map-marker-alert-outline" size={20} color={colors.danger} />
                <Text style={[font.small, { flex: 1, color: colors.danger }]}>
                  {t('plan.destSkipped', { names: skippedDestinations(trip.notes).join(', ') })}
                </Text>
              </Row>
            ) : null}
            <AreaWarnings notes={trip.notes} />
            <SourcesLine notes={trip.notes} />
            <RouteCard trip={trip} dayIndex={dayIndex} onPickDay={setDayIndex} />
            <Text style={[styles.dayTitle, { color: kidsMode ? colors.kids : colors.attraction }]}>{t('plan.dayTitle', { n: dayIndex + 1, place: day.anchorName })}</Text>
            <Text style={[font.body, { color: kidsMode ? colors.kids : colors.attraction, marginBottom: space.sm }]}>
              {kidsMode ? `${date(day.date, { weekday: 'long', day: 'numeric', month: 'long' })} · ${t('plan.kidsIntro')}` : date(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}
            </Text>
            <DayMapCard day={day} />
            <Text style={font.small}>{t('plan.dragHint')}</Text>
            {trip.accessNeeds.length ? (
              <Row style={{ marginTop: space.sm, alignItems: 'flex-start' }}>
                <MaterialCommunityIcons name="wheelchair-accessibility" size={18} color={accent} />
                <Text style={[font.small, { flex: 1 }]}>
                  {t('access.pace', { n: pacingFor(trip.accessNeeds).maxPerDay ?? 0, m: pacingFor(trip.accessNeeds).breakMinutes })}
                </Text>
              </Row>
            ) : null}
          </View>
        }
        ListEmptyComponent={<Text style={font.body}>{t('plan.empty')}</Text>}
        ListFooterComponent={<HotelCard day={day} />}
        renderItem={({ item }) => (
          <SlotView
            day={day}
            slot={item}
            mode={trip.ModeOfTravel}
            kidsMode={kidsMode}
            accent={accent}
            needs={trip.accessNeeds.filter((n) => (VERIFIABLE_NEEDS as string[]).includes(n))}
            onDetails={(id) => navigation.navigate('Attraction', { id, tripId: String(trip.id) })}
            onRemove={() => setDay(dayIndex, removeItem(day, item.key, trip.ModeOfTravel))}
            onMove={() =>
              Alert.alert(
                t('plan.moveToDay'),
                undefined,
                trip.itinerary
                  .map((d, i) => ({ d, i }))
                  .filter(({ i }) => i !== dayIndex)
                  .slice(0, 8)
                  .map(({ d, i }) => ({
                    text: `${t('plan.day', { n: i + 1 })} · ${date(d.date, { day: 'numeric', month: 'short' })}`,
                    onPress: () => {
                      const r = moveToDay(day, d, item.key, trip.ModeOfTravel);
                      if ('error' in r) {
                        toast(t('plan.moveRejected', { name: day.findAttraction(item.refId)?.name ?? '', reason: reasonText(r.error) }));
                        return;
                      }
                      const next = Trip.fromJSON(trip.toJSON());
                      next.itinerary[dayIndex] = r.from;
                      next.itinerary[i] = r.to;
                      commit(next);
                    },
                  })),
              )
            }
          />
        )}
      />
      </View>
    </View>
    </TintProvider>
  );
}

/** Which of the trip's needs this place is confirmed for, and which it isn't (shown only when needs were chosen). */
function AccessLine({ needs, confirmed }: { needs: string[]; confirmed: string[] }) {
  const { t } = useI18n();
  const label = (list: string[]) => list.map((n) => t(`access.${n}` as TKey)).join(', ');
  const yes = needs.filter((n) => confirmed.includes(n));
  const no = needs.filter((n) => !confirmed.includes(n));
  return (
    <View style={{ marginTop: space.sm, gap: 4 }}>
      {yes.length ? (
        <Row style={{ alignItems: 'flex-start' }}>
          <MaterialCommunityIcons name="check-circle-outline" size={18} color={colors.success} />
          <Text style={[font.small, { flex: 1, color: colors.success }]}>{t('access.confirmed', { needs: label(yes) })}</Text>
        </Row>
      ) : null}
      {no.length ? (
        <Row style={{ alignItems: 'flex-start' }}>
          <MaterialCommunityIcons name="help-circle-outline" size={18} color={colors.muted} />
          <Text style={[font.small, { flex: 1 }]}>{t('access.notConfirmed', { needs: label(no) })}</Text>
        </Row>
      ) : null}
    </View>
  );
}

function TravelRow({ slot, color }: { slot: ScheduledItem; color: string }) {
  const { t, duration } = useI18n();
  const leg = slot.travelBefore;
  if (!leg || leg.minutes <= 0) return null;
  const car = leg.mode === MODE_CAR;
  return (
    <Row style={styles.travel}>
      <MaterialCommunityIcons name={car ? 'car' : leg.minutes <= 15 && leg.distanceMeters < 1500 ? 'walk' : 'bus'} size={16} color={color} />
      <Text style={font.small}>
        {t('plan.travel', { time: duration(leg.minutes), mode: car ? t('plan.byCar') : t('plan.byTransit') })}
        {leg.estimated ? ` ${t('plan.estimated')}` : ''}
      </Text>
    </Row>
  );
}

function SlotView({
  day,
  slot,
  kidsMode,
  accent,
  needs,
  onDetails,
  onRemove,
  onMove,
}: {
  day: DayPlan;
  slot: ScheduledItem;
  mode: number;
  kidsMode: boolean;
  accent: string;
  /** The trip's checkable accessibility needs (empty when none were chosen). */
  needs: string[];
  onDetails: (id: string) => void;
  onRemove: () => void;
  onMove: () => void;
}) {
  const { t, clock } = useI18n();
  const card = useCardStyle();
  const drag = useReorderableDrag();
  const lists = useLists();
  const time = `${clock(slot.start)}–${clock(slot.end)}`;

  if (slot.kind === 'restaurant') {
    const r = day.findRestaurant(slot.refId);
    if (!r) return null;
    return (
      <View>
        <TravelRow slot={slot} color={accent} />
        <Pressable onLongPress={drag} onPress={() => openLink(r.linkToPage)} style={[ui.card, card, styles.item, { borderStartColor: colors.restaurant }]}>
          <Row>
            <MaterialCommunityIcons name="silverware-fork-knife" size={22} color={colors.restaurant} />
            <View style={{ flex: 1 }}>
              <Text style={font.small}>{`${time} · ${slot.meal === 'lunch' ? t('plan.lunch') : t('plan.dinner')}`}</Text>
              <Text style={font.h3}>{r.name}</Text>
              {r.cuisine.length ? <Text style={font.small}>{r.cuisine.slice(0, 3).join(' · ')}</Text> : null}
            </View>
            <MaterialCommunityIcons name="open-in-new" size={18} color={colors.muted} />
          </Row>
        </Pressable>
      </View>
    );
  }

  if (slot.kind === 'event') {
    const e = day.findEvent(slot.refId);
    if (!e) return null;
    return (
      <View>
        <TravelRow slot={slot} color={accent} />
        <Pressable onLongPress={slot.fixed ? undefined : drag} onPress={() => openLink(e.link)} style={[ui.card, card, styles.item, { borderStartColor: colors.event }]}>
          <Row style={{ alignItems: 'flex-start' }}>
            <MaterialCommunityIcons name="party-popper" size={24} color={colors.event} />
            <View style={{ flex: 1 }}>
              <Text style={font.small}>{`${time} · ${t('plan.event')}`}</Text>
              <Text style={font.h3}>{e.name}</Text>
              <Text style={font.small} numberOfLines={kidsMode ? 2 : 3}>{e.description}</Text>
              <Text style={[font.small, { color: colors.event }]}>{e.venue}</Text>
            </View>
          </Row>
        </Pressable>
      </View>
    );
  }

  const a = day.findAttraction(slot.refId);
  if (!a) return null;
  const kid = day.kidTexts.find((k) => k.attractionId === a.id);
  const fact = day.funFacts.find((f) => f.attractionId === a.id);
  const hours = describeHours(a.weeklyHours, day.date, clock);
  const fav = lists.has('favouriteAttraction', a.id);

  return (
    <View>
      <TravelRow slot={slot} color={accent} />
      <Pressable onLongPress={drag} delayLongPress={250} style={[ui.card, card, styles.item, { borderStartColor: kidsMode ? colors.kids : colors.attraction }]}>
        <Row style={{ alignItems: 'flex-start' }}>
          <View>
            {a.photo_urls[0] ? <Image source={{ uri: a.photo_urls[0] }} style={styles.thumb} contentFit="cover" /> : <View style={[styles.thumb, { backgroundColor: colors.attractionSoft }]} />}
            <View style={styles.emoji}>
              <Text style={{ fontSize: 20 }}>{attractionEmoji(a)}</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[font.small, { color: colors.attraction, fontWeight: '600' }]}>{time}</Text>
            <Text style={[font.h3, { color: colors.attraction }]}>{a.name}</Text>
            <Text style={[font.small, { color: colors.attraction }]}>
              {a.rating ? `${t((a.ratingSource ?? a.provider) === 'google' ? 'plan.googleRating' : 'plan.tripadvisorRating', { rating: a.rating })} · ` : ''}
              {t('plan.popularity', { score: popularityOf(a).toFixed(1) })}
            </Text>
            <Text style={font.small}>
              {hours ? `${t('plan.hours', { hours })}${a.hoursSource ? ` · ${t(`plan.hoursChecked.${a.hoursSource}` as TKey)}` : ''}` : t('plan.hoursUnknown')}
            </Text>
            {slot.meal ? (
              <Row>
                <MaterialCommunityIcons name="silverware-fork-knife" size={14} color={colors.restaurant} />
                <Text style={[font.small, { color: colors.restaurant }]}>{t(slot.meal === 'lunch' ? 'plan.lunchOnSite' : 'plan.dinnerOnSite')}</Text>
              </Row>
            ) : null}
          </View>
          <MaterialCommunityIcons name="drag-vertical" size={22} color={colors.muted} />
        </Row>

        {kidsMode ? (
          <View style={{ marginTop: space.sm }}>
            <Text style={font.body}>{kid?.text ?? t('plan.noKidText')}</Text>
            {kid ? (
              <Pressable onPress={() => openLink(kid.sourceUrl)}>
                <Text style={[font.small, { color: colors.kids }]}>{`${t('common.source')}: ${kid.sourceTitle}`}</Text>
              </Pressable>
            ) : null}
            {fact ? (
              <View style={[styles.fact, { borderColor: colors.kids, backgroundColor: tintFor(colors.kids).field }]}>
                <Row>
                  <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color={colors.kids} />
                  <Text style={[font.h3, { color: colors.kids }]}>{t('plan.funFact')}</Text>
                </Row>
                <Text style={font.body}>{fact.text}</Text>
                <Pressable onPress={() => openLink(fact.sourceUrl)}>
                  <Text style={[font.small, { color: colors.kids }]}>{t('plan.readMore')}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : a.description ? (
          <Text style={[font.body, { marginTop: space.sm }]} numberOfLines={3}>
            {a.description}
          </Text>
        ) : null}

        {needs.length ? <AccessLine needs={needs} confirmed={a.disabilityCompatible} /> : null}

        <Row wrap style={{ marginTop: space.sm }}>
          <Button small color={accent} icon="information-outline" label={t('plan.details')} onPress={() => onDetails(a.id)} />
          <IconButton icon={fav ? 'heart' : 'heart-outline'} color={accent} label={t('common.favourite')} onPress={async () => (await lists.toggle('favouriteAttraction', a.id)) && rememberPlace(a)} />
          <IconButton icon="calendar-arrow-right" color={accent} label={t('plan.moveToDay')} onPress={onMove} />
          <IconButton icon="delete-outline" color={colors.danger} label={t('plan.remove')} onPress={onRemove} />
        </Row>
      </Pressable>
    </View>
  );
}

const PRICE_SOURCE: Record<string, string> = { agoda: 'Agoda', 'google-hotels': 'Google Hotels' };

function HotelCard({ day }: { day: DayPlan }) {
  const { t, price } = useI18n();
  const card = useCardStyle();
  const h = day.hotel;
  if (!h) return null;
  const bookLabel = h.bookingVia === 'agoda' ? t('plan.bookAgoda') : h.bookingVia === 'website' ? t('plan.hotelWebsite') : t('plan.bookHotel');
  return (
    <View style={[ui.card, card, styles.item, { borderStartColor: colors.hotel, marginTop: space.md }]}>
      <Row style={{ alignItems: 'flex-start' }}>
        {h.photos[0] ? <Image source={{ uri: h.photos[0] }} style={styles.thumb} contentFit="cover" /> : <MaterialCommunityIcons name="bed" size={24} color={colors.hotel} />}
        <View style={{ flex: 1 }}>
          <Text style={font.small}>{t('plan.hotel')}</Text>
          <Text style={font.h3}>{h.name}</Text>
          {h.rating ? <Badge text={`★ ${h.rating}`} color={colors.hotel} /> : null}
          {h.price != null ? (
            <Text style={[font.body, { color: colors.hotel, fontWeight: '700' }]}>{t('plan.pricePerNight', { price: price(h.price, h.currency || 'EUR') })}</Text>
          ) : null}
          {h.price != null && PRICE_SOURCE[h.source] ? <Text style={font.small}>{t('plan.pricesVia', { source: PRICE_SOURCE[h.source] })}</Text> : null}
        </View>
      </Row>
      <Row wrap style={{ marginTop: space.sm }}>
        <Button small color={colors.hotel} icon="open-in-new" label={bookLabel} onPress={() => openLink(h.linkToBooking)} />
        {h.bookingVia !== 'booking.com' && h.linkToBookingCom ? (
          <Button small outline color={colors.hotel} label={t('plan.compareBookingCom')} onPress={() => openLink(h.linkToBookingCom)} />
        ) : null}
        {h.linkToListing ? <Button small outline color={colors.hotel} label={t('plan.hotelListing')} onPress={() => openLink(h.linkToListing)} /> : null}
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.md, paddingBottom: space.sm + 24, overflow: 'hidden' },
  sheet: { flex: 1, marginTop: -24, borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
  item: { padding: space.md, marginBottom: space.sm, borderStartWidth: 4 },
  thumb: { width: 64, height: 64, borderRadius: radius.sm },
  travel: { marginStart: space.lg, marginBottom: space.sm },
  fact: { marginTop: space.sm, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.md, padding: space.sm },
  dayTitle: { fontSize: 24, fontWeight: '700', marginTop: space.sm },
  note: { borderWidth: 1.5, borderRadius: 14, padding: space.md, marginBottom: space.md, alignItems: 'flex-start', backgroundColor: colors.attractionSoft },
  emoji: { position: 'absolute', bottom: -6, end: -6, width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.attraction },
  chip: { minHeight: 46, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
});

/**
 * The day and adult/kids chips on the dark header: selected = white with coloured text,
 * the others = a light glass tint with white text. Always readable, never grey.
 */
function HeaderChip({ label, sub, selected, onPress, ink }: { label: string; sub?: string; selected: boolean; onPress: () => void; ink: string }) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityState={{ selected }}
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
      style={[styles.chip, selected ? { backgroundColor: '#fff', borderColor: '#fff' } : { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: 'rgba(255,255,255,0.75)' }]}
    >
      <Text style={{ color: selected ? ink : '#fff', fontWeight: '700', fontSize: 15 }} numberOfLines={1}>
        {label}
      </Text>
      {sub ? <Text style={{ color: selected ? ink : 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '500' }}>{sub}</Text> : null}
    </PressableScale>
  );
}

/**
 * "Before you go": places on this trip that need a word of warning (Palestinian Authority towns,
 * Ukraine, Crimea…), each with the days and places it concerns.
 */
function AreaWarnings({ notes }: { notes: string[] }) {
  const { t } = useI18n();
  const warnings = notes.map(parseAreaNote).filter((w): w is AreaWarning => !!w);
  if (!warnings.length) return null;
  return (
    <View style={[styles.note, { borderColor: colors.danger, backgroundColor: tintFor(colors.danger).field }]} accessibilityRole="alert">
      <Row>
        <MaterialCommunityIcons name="alert-outline" size={20} color={colors.danger} />
        <Text style={[font.h3, { flex: 1, color: colors.danger }]}>{t('plan.area.title')}</Text>
      </Row>
      {warnings.map((w) => (
        <View key={`${w.id}:${w.country ?? ''}`} style={{ marginTop: space.sm }}>
          <Text style={[font.small, { fontWeight: '700', color: colors.danger }]}>{t('plan.area.where', { days: w.days.join(', '), places: w.places.join(', ') })}</Text>
          <Text style={[font.small, { color: colors.text }]}>{t(`plan.area.${w.id}` as TKey)}</Text>
        </View>
      ))}
    </View>
  );
}

/** "Sights from: Tripadvisor 12 · Wikipedia (Wikidata) 40 · …" — where this plan's places came from. */
function SourcesLine({ notes }: { notes: string[] }) {
  const { t } = useI18n();
  const raw = notes.find((n) => n.startsWith('sources:'));
  if (!raw) return null;
  let c: Record<string, number | number[]> = {};
  try {
    c = JSON.parse(raw.slice('sources:'.length)) as Record<string, number | number[]>;
  } catch {
    return null;
  }
  const n = (k: string) => (typeof c[k] === 'number' ? (c[k] as number) : 0);
  const parts: string[] = [];
  for (const k of ['tripadvisor', 'google', 'wikidata', 'osm', 'backup', 'phone', 'wikipedia'] as const) if (n(k) > 0) parts.push(t(`plan.src.${k}` as TKey, { n: n(k) }));
  if (n('serverFailed') > 0) parts.push(t('plan.src.serverFailed'));
  const http = Array.isArray(c.http) ? (c.http as number[]).filter((h) => h >= 400 && h !== 404) : [];
  if (http.includes(429)) parts.push(t('plan.src.http429'));
  const other = http.filter((h) => h !== 429);
  if (other.length) parts.push(t('plan.src.httpOther', { codes: other.join(', ') }));
  if (!parts.length) return null;
  return <Text style={[font.small, { marginBottom: space.sm, color: colors.attraction }]}>{t('plan.note.sources', { list: parts.join(' · ') })}</Text>;
}
