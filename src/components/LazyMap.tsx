import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import type { Ref } from 'react';
import MapView, { Marker, PROVIDER_GOOGLE, Polyline, Region } from 'react-native-maps';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { config } from '../config';
import { useI18n } from '../i18n';
import { colors, font, space } from '../theme';
import { MapNotice } from './MapNotice';
import { Text } from './Text';
import { useTint } from './Tint';

export interface MapPin {
  id: string;
  lat: number;
  lon: number;
  color: string;
  title: string;
  description?: string;
}

export const validLatLon = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** A region showing every point, with a margin (at least ~2 km across). */
export function regionAround(points: Array<{ lat: number; lon: number }>): Region | undefined {
  const ok = points.filter((p) => validLatLon(p.lat, p.lon));
  if (!ok.length) return undefined;
  const lats = ok.map((p) => p.lat);
  const lons = ok.map((p) => p.lon);
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.4),
    longitudeDelta: Math.max(0.02, (maxLon - minLon) * 1.4),
  };
}

/** If the map ever fails, only its box says so; the rest of the screen keeps working. */
class MapBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error('Map failed', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * A Google map that never holds up its screen: Google Maps can take a few seconds to start the
 * first time (especially on an emulator), so the screen is drawn first and the map is started
 * just after, in its own box. Pins are added once the map is ready, and only with real positions.
 * Without a Maps key it shows a notice instead (a map without a key would crash).
 */
export const LazyMap = React.memo(function LazyMap({
  pins,
  line,
  lineColor = colors.attraction,
  initialRegion,
  mapRef,
  onRegionChangeComplete,
  onPinPress,
  showsUserLocation,
  style,
}: {
  pins: MapPin[];
  /** Drawn as a line in this order (the route). */
  line?: Array<{ lat: number; lon: number }>;
  lineColor?: string;
  initialRegion?: Region;
  mapRef?: Ref<MapView>;
  onRegionChangeComplete?: (r: Region) => void;
  onPinPress?: (id: string) => void;
  showsUserLocation?: boolean;
  style?: object;
}) {
  const { t } = useI18n();
  const tint = useTint();
  const [mount, setMount] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Let the screen paint its first frame, then start the map.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => setMount(true), 250);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // The map itself, also handed to the screen's own ref.
  const inner = useRef<MapView | null>(null);
  const setRef = useCallback(
    (m: MapView | null) => {
      inner.current = m;
      if (typeof mapRef === 'function') mapRef(m);
      else if (mapRef && typeof mapRef === 'object') (mapRef as { current: MapView | null }).current = m;
    },
    [mapRef],
  );
  // Show the asked-for place once the map is ready, and again whenever it changes (another day of
  // the trip): a map otherwise stays where it first opened, which on some phones is not
  // `initialRegion` at all.
  const regionKey = initialRegion
    ? [initialRegion.latitude, initialRegion.longitude, initialRegion.latitudeDelta, initialRegion.longitudeDelta].map((v) => v.toFixed(4)).join(',')
    : '';
  useEffect(() => {
    if (ready && initialRegion) inner.current?.animateToRegion(initialRegion, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, regionKey]);

  const okPins = useMemo(() => pins.filter((p) => validLatLon(p.lat, p.lon)).slice(0, 200), [pins]);
  const okLine = useMemo(() => (line ?? []).filter((p) => validLatLon(p.lat, p.lon)).map((p) => ({ latitude: p.lat, longitude: p.lon })), [line]);
  const region = initialRegion ?? regionAround([...okPins, ...(line ?? [])]);

  const box = (text: string, busy: boolean) => (
    <View style={[StyleSheet.absoluteFill, styles.box, { backgroundColor: tint.surface }]} pointerEvents="none">
      {busy ? <ActivityIndicator color={tint.accent} /> : <MaterialCommunityIcons name="map-marker-off-outline" size={32} color={tint.accent} />}
      <Text style={[font.small, styles.text]}>{text}</Text>
    </View>
  );

  return (
    <View style={[styles.wrap, { backgroundColor: tint.surface, borderColor: tint.line }, style]}>
      {!config.hasGoogleMapsKey ? (
        <MapNotice />
      ) : !mount ? (
        box(t('weekend.mapLoading'), true)
      ) : (
        <MapBoundary fallback={box(t('weekend.mapUnavailable'), false)}>
          <MapView
            ref={setRef}
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFill}
            initialRegion={region}
            showsUserLocation={showsUserLocation}
            toolbarEnabled={false}
            onMapReady={() => setReady(true)}
            onRegionChangeComplete={onRegionChangeComplete}
          >
            {ready && okLine.length > 1 ? <Polyline coordinates={okLine} strokeColor={lineColor} strokeWidth={4} /> : null}
            {ready
              ? okPins.map((p) => (
                  <Marker
                    key={p.id}
                    identifier={p.id}
                    coordinate={{ latitude: p.lat, longitude: p.lon }}
                    pinColor={p.color}
                    title={p.title}
                    description={p.description}
                    tracksViewChanges={false}
                    onCalloutPress={onPinPress ? () => onPinPress(p.id) : undefined}
                  />
                ))
              : null}
          </MapView>
          {!ready ? box(t('weekend.mapLoading'), true) : null}
        </MapBoundary>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { height: 260, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  box: { alignItems: 'center', justifyContent: 'center', padding: space.lg },
  text: { textAlign: 'center', marginTop: space.sm },
});
