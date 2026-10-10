import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useI18n } from '../i18n';
import type { TKey } from '../i18n';
import { DISABILITIES, EVENT_TYPES, EventType } from '../models';
import { colors, space } from '../theme';
import { Accordion } from './Accordion';
import { useTint } from './Tint';
import { DateField } from './DateField';
import { Text, TextInput } from './Text';
import { Button, Chip, Field, Row } from './ui';

export interface Filters {
  name: string;
  from?: Date;
  to?: Date;
  age?: number;
  country?: string;
  minPrice?: number;
  maxPrice?: number;
  types: EventType[];
  /** Accessibility needs the camp must support (camps only). */
  needs: string[];
  /** Camp organiser (camps only). */
  provider?: string;
}

export const emptyFilters = (): Filters => ({ name: '', types: [], needs: [] });

export function activeCount(f: Filters): number {
  return (
    [f.from, f.to, f.age, f.country, f.minPrice, f.maxPrice, f.provider].filter((x) => x != null && x !== '').length +
    f.types.length +
    f.needs.length
  );
}

/**
 * Search and filters for the Camps and Events lists, as fold-out panels: a search box that is
 * always there, then "Filters" which opens into one panel per question (When, Who's going,
 * Budget, What kind, Where, Accessibility, Organiser). Each closed panel shows what's chosen.
 */
export function FilterPanel({
  value,
  onChange,
  countries,
  providers = [],
  showAge,
  showTypes,
  showAccess,
  color,
}: {
  value: Filters;
  onChange: (f: Filters) => void;
  countries: string[];
  providers?: string[];
  showAge?: boolean;
  showTypes?: boolean;
  showAccess?: boolean;
  color: string;
}) {
  const { t, country, date, dateRange, price } = useI18n();
  const tint = useTint();
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  const num = (s: string) => (s.trim() === '' || Number.isNaN(Number(s)) ? undefined : Number(s));
  const toggleIn = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

  const when =
    value.from && value.to
      ? dateRange(value.from, value.to)
      : value.from
        ? `${t('filter.startsAfter')} ${date(value.from)}`
        : value.to
          ? `${t('filter.endsBefore')} ${date(value.to)}`
          : '';
  const budget =
    value.minPrice != null && value.maxPrice != null
      ? `${price(value.minPrice)}–${price(value.maxPrice)}`
      : value.minPrice != null
        ? `≥ ${price(value.minPrice)}`
        : value.maxPrice != null
          ? `≤ ${price(value.maxPrice)}`
          : '';
  const age = value.age != null ? t('filter.ageValue', { age: value.age }) : '';
  const kinds = value.types.map((ty) => t(`type.${ty}` as TKey)).join(', ');
  const where = value.country ? country(value.country) : '';
  const needs = value.needs.map((n) => t(`access.${n}` as TKey)).join(', ');
  const summary = [when, age, budget, kinds, where, needs, value.provider ?? ''].filter(Boolean).join(' · ') || t('filter.nothingSet');
  const count = activeCount(value);

  return (
    <View style={[styles.wrap, { backgroundColor: tint.surface, borderColor: tint.line }]}>
      <View style={[styles.search, { backgroundColor: tint.field, borderColor: tint.line }]}>
        <MaterialCommunityIcons name="magnify" size={22} color={color} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('filter.namePlaceholder')}
          placeholderTextColor={colors.muted}
          value={value.name}
          onChangeText={(name) => set({ name })}
          returnKeyType="search"
          accessibilityLabel={t('filter.name')}
        />
      </View>
      <Accordion flat title={count ? `${t('common.filters')} (${count})` : t('common.filters')} summary={summary} icon="tune-variant" color={color}>
        <Accordion flat title={t('filter.when')} summary={when || t('filter.anyTime')} icon="calendar-range" color={color}>
          <Row>
            <DateField label={t('filter.startsAfter')} value={value.from} onChange={(from) => set({ from })} clearable color={color} />
            <DateField label={t('filter.endsBefore')} value={value.to} onChange={(to) => set({ to })} min={value.from} clearable color={color} />
          </Row>
        </Accordion>

        {showAge ? (
          <Accordion flat title={t('filter.who')} summary={age || t('filter.anyAge')} icon="account-child-outline" color={color}>
            <Field label={t('filter.age')} keyboardType="number-pad" value={value.age != null ? String(value.age) : ''} onChangeText={(s) => set({ age: num(s) })} />
          </Accordion>
        ) : null}

        <Accordion flat title={t('filter.budget')} summary={budget || t('filter.anyBudget')} icon="wallet-outline" color={color}>
          <Row>
            <View style={{ flex: 1 }}>
              <Field label={t('filter.priceMin')} keyboardType="number-pad" value={value.minPrice != null ? String(value.minPrice) : ''} onChangeText={(s) => set({ minPrice: num(s) })} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('filter.priceMax')} keyboardType="number-pad" value={value.maxPrice != null ? String(value.maxPrice) : ''} onChangeText={(s) => set({ maxPrice: num(s) })} />
            </View>
          </Row>
        </Accordion>

        {showTypes ? (
          <Accordion flat title={t('filter.kind')} summary={kinds || t('filter.anyKind')} icon="shape-outline" color={color}>
            <View style={styles.chips}>
              {EVENT_TYPES.map((ty) => (
                <Chip key={ty} label={t(`type.${ty}` as TKey)} color={color} selected={value.types.includes(ty)} onPress={() => set({ types: toggleIn(value.types, ty) })} />
              ))}
            </View>
          </Accordion>
        ) : null}

        {countries.length ? (
          <Accordion flat title={t('filter.where')} summary={where || t('filter.anywhere')} icon="earth" color={color}>
            <View style={styles.chips}>
              <Chip label={t('common.all')} color={color} selected={!value.country} onPress={() => set({ country: undefined })} />
              {countries.map((c) => (
                <Chip key={c} label={country(c)} color={color} selected={value.country === c} onPress={() => set({ country: value.country === c ? undefined : c })} />
              ))}
            </View>
          </Accordion>
        ) : null}

        {showAccess ? (
          <Accordion flat title={t('access.title')} summary={needs || t('access.none')} icon="wheelchair-accessibility" color={color}>
            <Text style={styles.intro}>{t('access.campIntro')}</Text>
            <View style={styles.chips}>
              {DISABILITIES.map((n) => (
                <Chip key={n} label={t(`access.${n}` as TKey)} color={color} selected={value.needs.includes(n)} onPress={() => set({ needs: toggleIn(value.needs, n) })} />
              ))}
            </View>
          </Accordion>
        ) : null}

        {providers.length > 1 ? (
          <Accordion flat title={t('filter.provider')} summary={value.provider ?? t('filter.anyProvider')} icon="domain" color={color}>
            <View style={styles.chips}>
              <Chip label={t('common.all')} color={color} selected={!value.provider} onPress={() => set({ provider: undefined })} />
              {providers.map((p) => (
                <Chip key={p} label={p} color={color} selected={value.provider === p} onPress={() => set({ provider: value.provider === p ? undefined : p })} />
              ))}
            </View>
          </Accordion>
        ) : null}

        {count ? (
          <Button small outline label={t('common.clearFilters')} icon="close" color={color} onPress={() => onChange({ ...emptyFilters(), name: value.name })} style={{ marginTop: space.md }} />
        ) : null}
      </Accordion>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 20, borderWidth: 1, marginBottom: space.lg, overflow: 'hidden' },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, minHeight: 56, margin: space.md, marginBottom: space.sm, borderRadius: 16, borderWidth: 1.5 },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  intro: { fontSize: 14, lineHeight: 20, color: colors.muted, marginBottom: space.sm },
});
