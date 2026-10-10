import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { MapNotice } from '../../components/MapNotice';
import { config } from '../../config';
import { Button, Chip, Empty, Field, Row, Screen, Section, Toggle, toast } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import type { TKey } from '../../i18n';
import { EVENT_TYPES, EventJSON, EventType, PhotoSource, validateEvent } from '../../models';
import type { RootScreen } from '../../navigation/types';
import { api } from '../../services/api';
import { publishEvent } from '../../services/eventService';
import { colors, font, radius, space } from '../../theme';

/**
 * Admin "Add an Event". The form refuses to publish unless the event is in person
 * (address + map pin, no online wording), has an official source link, and every photo has
 * the page it comes from and a credit. Firestore rules enforce the same checks server-side.
 */
export function AddEventScreen({ navigation }: RootScreen<'AddEvent'>) {
  const { t, lang } = useI18n();
  const { isAdmin, firebaseUser } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [types, setTypes] = useState<EventType[]>([]);
  const [country, setCountry] = useState('IL');
  const [venue, setVenue] = useState('');
  const [address, setAddress] = useState('');
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [price, setPrice] = useState('');
  const [priceText, setPriceText] = useState('');
  const [link, setLink] = useState('');
  const [bookingLink, setBookingLink] = useState('');
  const [photos, setPhotos] = useState<PhotoSource[]>([{ url: '', sourcePage: '', credit: '' }]);
  const [physical, setPhysical] = useState(false);
  const [realPhotos, setRealPhotos] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  if (!isAdmin) {
    return (
      <Screen title={t('addEvent.title')} accent={colors.weekend}>
        <Empty text={t('addEvent.notAdmin')} icon="lock-outline" />
      </Screen>
    );
  }

  const findOnMap = async () => {
    const r = await api.geocode({ query: `${venue}, ${address}`, lang }).catch(() => null);
    if (r) {
      setPin({ latitude: r.lat, longitude: r.lon });
      if (r.country) setCountry(r.country);
    } else toast(t('planner.err.city', { city: address }));
  };

  const time = (s: string) => (/^\d{2}:\d{2}$/.test(s.trim()) ? s.trim() : undefined);

  const publish = async () => {
    const usedPhotos = photos.filter((p) => p.url.trim());
    const e: EventJSON = {
      id: '',
      name: name.trim(),
      description: description.trim(),
      startDate: startDate.trim(),
      endDate: (endDate || startDate).trim(),
      types,
      country: country.trim().toUpperCase(),
      price: price.trim() === '' ? null : Number(price),
      link: link.trim(),
      bookingLink: bookingLink.trim() || undefined,
      photo_urls: usedPhotos.map((p) => p.url.trim()),
      photoSources: usedPhotos.map((p) => ({ url: p.url.trim(), sourcePage: p.sourcePage.trim(), credit: p.credit.trim() })),
      location: { locLat: pin?.latitude ?? 0, locLon: pin?.longitude ?? 0 },
      venue: venue.trim(),
      address: address.trim(),
      priceText: priceText.trim() || undefined,
      currency: 'EUR',
      startTime: time(startTime),
      endTime: time(endTime),
      datesConfirmed: true,
      origin: 'admin',
      sourceName: (() => {
        try {
          return new URL(link.trim()).hostname.replace(/^www\./, '');
        } catch {
          return '';
        }
      })(),
    };
    const p = validateEvent(e);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(e.endDate)) p.push('badDates');
    if (!physical || !realPhotos) p.push('mustConfirm');
    setProblems([...new Set(p)]);
    if (p.length) return;
    setBusy(true);
    try {
      await publishEvent(e, firebaseUser!.uid);
      toast(t('addEvent.published'));
      navigation.goBack();
    } catch {
      toast(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const C = colors.weekend;
  return (
    <Screen title={t('addEvent.title')} accent={C}>
      <Text style={[font.small, { marginBottom: space.md }]}>{t('addEvent.rules')}</Text>
      <Field label={t('addEvent.name')} value={name} onChangeText={setName} />
      <Field label={t('addEvent.description')} value={description} onChangeText={setDescription} multiline />
      <Row>
        <View style={{ flex: 1 }}>
          <Field label={t('addEvent.startDate')} value={startDate} onChangeText={setStartDate} placeholder="2026-10-17" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t('addEvent.endDate')} value={endDate} onChangeText={setEndDate} placeholder="2026-10-18" />
        </View>
      </Row>
      <Row>
        <View style={{ flex: 1 }}>
          <Field label={t('addEvent.startTime')} value={startTime} onChangeText={setStartTime} placeholder="19:00" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t('addEvent.endTime')} value={endTime} onChangeText={setEndTime} placeholder="22:00" />
        </View>
      </Row>
      <Text style={styles.label}>{t('addEvent.types')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {EVENT_TYPES.map((ty) => (
          <Chip key={ty} label={t(`type.${ty}` as TKey)} color={C} selected={types.includes(ty)} onPress={() => setTypes(types.includes(ty) ? types.filter((x) => x !== ty) : [...types, ty])} />
        ))}
      </View>

      <Section title={t('weekend.venue')}>
        <Field label={t('addEvent.venue')} value={venue} onChangeText={setVenue} />
        <Field label={t('addEvent.address')} value={address} onChangeText={setAddress} />
        <Field label={t('addEvent.country')} value={country} onChangeText={setCountry} autoCapitalize="characters" maxLength={2} />
        <Button small outline color={C} icon="map-marker-radius" label={t('addEvent.findOnMap')} onPress={findOnMap} />
        <View style={styles.map}>
          {!config.hasGoogleMapsKey ? (
            <MapNotice />
          ) : (
          <MapView
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFill}
            region={pin ? { ...pin, latitudeDelta: 0.01, longitudeDelta: 0.01 } : undefined}
            onLongPress={(ev) => setPin(ev.nativeEvent.coordinate)}
          >
            {pin ? <Marker coordinate={pin} pinColor={C} draggable onDragEnd={(ev) => setPin(ev.nativeEvent.coordinate)} /> : null}
          </MapView>
          )}
        </View>
        <Text style={font.small}>{t('addEvent.pinHint')}</Text>
      </Section>

      <Section title={t('booking.payment')}>
        <Field label={t('addEvent.price')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
        <Field label={t('addEvent.priceText')} value={priceText} onChangeText={setPriceText} />
        <Field label={t('addEvent.link')} value={link} onChangeText={setLink} autoCapitalize="none" keyboardType="url" placeholder="https://…" />
        <Field label={t('addEvent.bookingLink')} value={bookingLink} onChangeText={setBookingLink} autoCapitalize="none" keyboardType="url" />
      </Section>

      <Section title={t('addEvent.photos')}>
        {photos.map((p, i) => (
          <View key={i} style={styles.photoBox}>
            <Field label={t('addEvent.photoUrl')} value={p.url} autoCapitalize="none" onChangeText={(url) => setPhotos(photos.map((x, k) => (k === i ? { ...x, url } : x)))} />
            <Field label={t('addEvent.photoSourcePage')} value={p.sourcePage} autoCapitalize="none" onChangeText={(sourcePage) => setPhotos(photos.map((x, k) => (k === i ? { ...x, sourcePage } : x)))} />
            <Field label={t('addEvent.photoCredit')} value={p.credit} onChangeText={(credit) => setPhotos(photos.map((x, k) => (k === i ? { ...x, credit } : x)))} />
          </View>
        ))}
        <Button small outline color={C} icon="plus" label={t('addEvent.addPhoto')} onPress={() => setPhotos([...photos, { url: '', sourcePage: '', credit: '' }])} />
      </Section>

      <View style={{ marginTop: space.lg }}>
        <Toggle label={t('addEvent.confirmPhysical')} value={physical} onChange={setPhysical} color={C} />
        <Toggle label={t('addEvent.confirmRealPhotos')} value={realPhotos} onChange={setRealPhotos} color={C} />
      </View>
      {problems.map((p) => (
        <Text key={p} style={{ color: colors.danger, marginTop: 4 }}>
          • {t(`addEvent.err.${p}` as TKey)}
        </Text>
      ))}
      <Button label={t('addEvent.save')} color={C} icon="check" loading={busy} onPress={publish} style={{ marginTop: space.lg }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  map: { height: 220, borderRadius: radius.md, overflow: 'hidden', marginVertical: space.sm },
  photoBox: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.md, marginBottom: space.sm },
});
