import React, { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from './Text';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useI18n } from '../i18n';
import type { PhotoSource } from '../models';
import { api } from '../services/api';
import { colors, radius, space } from '../theme';
import { openLink, toast } from './ui';
import { useTint } from './Tint';

/**
 * Every photo in Firefly shows where it comes from: a small "source" tag opens the page that
 * published it, and a long press lets anyone report a photo that looks AI-made or wrong
 * (it is hidden for everyone until an admin reviews it).
 */
export function PhotoCarousel({
  photos,
  sources,
  itemId,
  height = 220,
  rounded = false,
}: {
  photos: string[];
  sources: PhotoSource[];
  itemId: string;
  height?: number;
  rounded?: boolean;
}) {
  const { width } = useWindowDimensions();
  const tint = useTint();
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const items = photos.map((url, i) => ({ url, source: sources[i] })).filter((p) => !hidden.has(p.url));
  const w = rounded ? width - space.lg * 2 : width;

  if (!items.length) {
    return (
      <View style={[styles.placeholder, { height, width: w, backgroundColor: tint.surface }, rounded && { borderRadius: radius.lg }]}>
        <MaterialCommunityIcons name="image-off-outline" size={36} color={tint.accent} />
      </View>
    );
  }

  const report = (url: string, source?: PhotoSource) =>
    Alert.alert(t('photo.where'), source?.credit ?? '', [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.source'), onPress: () => source && openLink(source.sourcePage) },
      {
        text: t('photo.report'),
        style: 'destructive',
        onPress: async () => {
          setHidden(new Set([...hidden, url]));
          try {
            await api.reportPhoto({ url, sourcePage: source?.sourcePage ?? '', itemId, reason: 'user report' });
          } catch {
            /* still hidden locally */
          }
          toast(t('photo.reported'));
        },
      },
    ]);

  return (
    <View>
      <FlatList
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.url}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / w))}
        renderItem={({ item }) => (
          <Pressable onLongPress={() => report(item.url, item.source)} delayLongPress={500}>
            <Image
              source={{ uri: item.url }}
              style={[{ width: w, height }, rounded && { borderRadius: radius.lg }]}
              contentFit="cover"
              transition={200}
              accessibilityLabel={item.source?.credit}
            />
            {item.source ? (
              <Pressable style={styles.credit} onPress={() => openLink(item.source!.sourcePage)} accessibilityRole="link">
                <MaterialCommunityIcons name="information-outline" size={12} color="#fff" />
                <Text style={styles.creditText} numberOfLines={1}>
                  {t('common.photoCredit', { credit: item.source.credit })}
                  {item.source.license ? ` · ${item.source.license}` : ''}
                </Text>
              </Pressable>
            ) : null}
          </Pressable>
        )}
      />
      {items.length > 1 ? (
        <View style={styles.dots}>
          {items.map((p, i) => (
            <View key={p.url} style={[styles.dot, { backgroundColor: tint.line }, i === index && { backgroundColor: tint.accent }]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  credit: {
    position: 'absolute',
    bottom: 8,
    start: 8,
    maxWidth: '85%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  creditText: { color: '#fff', fontSize: 11 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, paddingVertical: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  dotActive: { backgroundColor: colors.night },
});
