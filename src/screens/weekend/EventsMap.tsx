import React, { useMemo } from 'react';
import type { Ref } from 'react';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';
import { LazyMap } from '../../components/LazyMap';
import type { Event, Location } from '../../models';
import { colors } from '../../theme';

export const validPoint = (l?: { locLat: number; locLon: number } | null) =>
  !!l && Number.isFinite(l.locLat) && Number.isFinite(l.locLon) && Math.abs(l.locLat) <= 90 && Math.abs(l.locLon) <= 180;

export function regionFor(c: Location, km: number): Region {
  const d = Math.max(0.05, (km * 2) / 111);
  return { latitude: c.locLat, longitude: c.locLon, latitudeDelta: d, longitudeDelta: d };
}

/**
 * The Events map (see LazyMap: drawn just after the page, so it never holds the screen up).
 * Tapping a pin shows the event's name and venue; tapping that scrolls to the event.
 */
export const EventsMap = React.memo(function EventsMap({
  mapRef,
  events,
  center,
  radiusKm,
  onRegionChangeComplete,
  onPinPress,
}: {
  mapRef: Ref<MapView>;
  events: Event[];
  /** null: fit the map to the pins (Israel / world lists). */
  center: Location | null;
  radiusKm: number;
  onRegionChangeComplete: (r: Region) => void;
  onPinPress: (eventId: string) => void;
}) {
  const pins = useMemo(
    () =>
      events
        .filter((e) => validPoint(e.location))
        .map((e) => ({ id: e.id, lat: e.location.locLat, lon: e.location.locLon, color: colors.weekend, title: e.name, description: e.venue })),
    [events],
  );
  return (
    <LazyMap
      pins={pins}
      mapRef={mapRef}
      initialRegion={center && validPoint(center) ? regionFor(center, radiusKm) : undefined}
      showsUserLocation
      onRegionChangeComplete={onRegionChangeComplete}
      onPinPress={onPinPress}
      style={{ height: '100%', borderWidth: 0, borderRadius: 0 }}
    />
  );
});
