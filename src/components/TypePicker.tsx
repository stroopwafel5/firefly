import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TYPE_ICONS } from '../data/tripTypes';
import { useI18n } from '../i18n';
import type { TKey } from '../i18n';
import { EVENT_TYPES, EventType, PhotoSource } from '../models';
import { typePhotos } from '../services/wikipedia';
import { colors, radius, space, typeColors } from '../theme';
import { openLink } from './ui';

/**
 * Booking.com-style tiles for the trip types. Each tile has its own colour (green for Nature,
 * terracotta for History, raspberry for Theatre…) and shows a real photograph of a real, named
 * place (e.g. Nature → the Black Forest, History → Neuschwanstein Castle), loaded from Wikipedia
 * with a tappable credit — never an AI "concept" picture. Without the photo the tile is simply
 * its colour with the type's icon: never grey.
 */
export function TypePicker({ value, onChange, color = colors.planner }: { value: EventType[]; onChange: (v: EventType[]) => void; color?: string }) {
  const { t } = useI18n();
  const [photos, setPhotos] = useState<Partial<Record<EventType, PhotoSource & { place: string }>>>({});
  useEffect(() => {
    typePhotos().then(setPhotos).catch(() => undefined);
  }, []);
  const toggle = (type: EventType) => onChange(value.includes(type) ? value.filter((x) => x !== type) : [...value, type]);

  return (
    <View style={styles.grid}>
      {EVENT_TYPES.map((type) => {
        const selected = value.includes(type);
        const photo = photos[type];
        const tc = typeColors[type];
        return (
          <Pressable
            key={type}
            onPress={() => toggle(type)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={t(`type.${type}` as TKey)}
            style={[styles.tile, { backgroundColor: tc, borderColor: selected ? color : 'transparent' }]}
          >
            {photo ? (
              <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.iconBg]}>
                <MaterialCommunityIcons name={TYPE_ICONS[type] as never} size={40} color="rgba(255,255,255,0.9)" />
              </View>
            )}
            {/* The type's colour over the lower part of the photo, so the label reads clearly. */}
            <View style={[styles.band, { backgroundColor: tc }]} />
            {selected ? (
              <View style={styles.tick}>
                <MaterialCommunityIcons name="check-bold" size={16} color={tc} />
              </View>
            ) : null}
            <View style={styles.labelRow}>
              <MaterialCommunityIcons name={TYPE_ICONS[type] as never} size={18} color="#fff" />
              <Text style={styles.label}>{t(`type.${type}` as TKey)}</Text>
            </View>
            {photo ? (
              <Pressable style={styles.credit} onPress={() => openLink(photo.sourcePage)} hitSlop={6}>
                <Text style={styles.creditText} numberOfLines={1}>
                  {photo.place}
                </Text>
              </Pressable>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tile: { width: '48.5%', height: 104, borderRadius: radius.md, overflow: 'hidden', marginBottom: space.sm, borderWidth: 3 },
  iconBg: { alignItems: 'center', justifyContent: 'center', paddingBottom: 30 },
  band: { position: 'absolute', start: 0, end: 0, bottom: 0, height: 50, opacity: 0.88 },
  tick: { position: 'absolute', top: 8, end: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  labelRow: { position: 'absolute', bottom: 22, start: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { color: '#fff', fontWeight: '800', fontSize: 16 },
  credit: { position: 'absolute', bottom: 4, start: 10, end: 10 },
  creditText: { color: '#fff', fontSize: 10 },
});
