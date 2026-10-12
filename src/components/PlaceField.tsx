import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from './Text';
import { useTint } from './Tint';
import { useI18n } from '../i18n';
import { Location } from '../models';
import type { PickedPlace } from '../planner/generator';
import { Suggestion, localPlaceMatches, mergePlaceSuggestions } from '../planner/places';
import { api } from '../services/api';
import { serverConfigured } from '../services/firebase';
import { colors, font, space } from '../theme';

/**
 * A place field with suggestions, for the trip's start and end: type in Hebrew, Russian or
 * English and pick from the list (big cities appear at once, other places from the server).
 * The picked place goes to the planner as is, so it is never looked up again by its text.
 */
export function PlaceField({
  label,
  placeholder,
  value,
  onChangeText,
  picked,
  onPick,
  color,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChangeText: (s: string) => void;
  picked?: PickedPlace;
  onPick: (p: PickedPlace | undefined) => void;
  color: string;
}) {
  const { t, lang } = useI18n();
  const tint = useTint();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const seq = useRef(0);

  const lookUp = async (text: string, typing: boolean) => {
    const id = ++seq.current;
    const local = localPlaceMatches(text);
    setItems(local);
    if (!serverConfigured || text.trim().length < 2) return;
    setBusy(true);
    try {
      const r = await api.placeSuggest({ query: text.trim(), lang, typing });
      if (id === seq.current) setItems(mergePlaceSuggestions(r.items, local));
    } catch {
      /* offline: the local matches stay */
    } finally {
      if (id === seq.current) setBusy(false);
    }
  };

  // Suggestions half a second after the last key.
  useEffect(() => {
    if (picked || !focused) return;
    const text = value.trim();
    if (text.length < 2) {
      setItems([]);
      return;
    }
    setItems(localPlaceMatches(text));
    const timer = setTimeout(() => lookUp(text, true), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused, picked]);

  const choose = (s: Suggestion) => {
    seq.current++;
    onChangeText(s.name);
    onPick({ name: s.name, location: new Location(s.lat, s.lon), country: s.country });
    setItems([]);
    setBusy(false);
  };

  const showList = focused && !picked && value.trim().length >= 2;
  return (
    <View style={{ marginBottom: space.md }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.box, { backgroundColor: tint.field, borderColor: picked ? color : tint.line }]}>
        <MaterialCommunityIcons name={picked ? 'map-marker-check' : 'map-marker-outline'} size={20} color={color} />
        <TextInput
          value={value}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          onChangeText={(s) => {
            onChangeText(s);
            if (picked) onPick(undefined);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          onSubmitEditing={() => lookUp(value, false)}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="words"
          style={[styles.input, { color: colors.text }]}
          accessibilityLabel={label || placeholder}
        />
        {value ? (
          <Pressable
            onPress={() => {
              onChangeText('');
              onPick(undefined);
              setItems([]);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.remove')}
          >
            <MaterialCommunityIcons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {picked ? (
        <Text style={[font.small, { color, marginTop: 4 }]}>{t('planner.placeChosen', { place: picked.name })}</Text>
      ) : null}
      {showList ? (
        <View style={[styles.list, { backgroundColor: tint.surface, borderColor: tint.line }]}>
          {items.map((s, i) => (
            <Pressable
              key={`${s.name}-${s.lat}-${i}`}
              onPress={() => choose(s)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: tint.field }]}
              accessibilityRole="button"
              accessibilityLabel={`${s.name}${s.detail ? `, ${s.detail}` : ''}`}
            >
              <MaterialCommunityIcons name="map-marker" size={18} color={color} />
              <View style={{ flex: 1 }}>
                <Text style={[font.body, { fontWeight: '600' }]} numberOfLines={1}>
                  {s.name}
                </Text>
                {s.detail ? (
                  <Text style={font.small} numberOfLines={1}>
                    {s.detail}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
          {!items.length ? <Text style={[font.small, { padding: space.md }]}>{busy ? t('planner.placeSearching') : t('planner.placeNone')}</Text> : null}
          {items.length && busy ? <Text style={[font.small, { paddingHorizontal: space.md, paddingBottom: space.sm }]}>{t('planner.placeSearching')}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '500', color: colors.muted, marginBottom: 6 },
  box: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: space.md, minHeight: 52 },
  input: { flex: 1, fontSize: 16, paddingVertical: 12 },
  list: { borderWidth: 1, borderRadius: 14, marginTop: 6, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: 10 },
});
