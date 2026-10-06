import { distanceMeters, type ClubPlace, type LatLng, type RedZone } from '@identity/shared';
import type { DbOrTx } from '../db/client';
import { redZones, type ClubPlaceRow, type RedZoneRow } from '../db/schema';

/** Red zones: few circles, read whole. */
export const loadRedZones = (db: DbOrTx): Promise<RedZoneRow[]> => db.select().from(redZones);

/** The red zone containing `point`, if any: positions there are never shown. */
export function redZoneAt(zones: readonly RedZoneRow[], point: LatLng): RedZoneRow | undefined {
  return zones.find((zone) => distanceMeters(zone, point) <= zone.radius);
}

export const toRedZoneDto = (zone: RedZoneRow): RedZone => ({
  id: zone.id,
  name: zone.name,
  lat: zone.lat,
  lng: zone.lng,
  radius: zone.radius,
});

export const toClubPlaceDto = (place: ClubPlaceRow): ClubPlace => ({
  id: place.id,
  name: place.name,
  category: place.category,
  description: place.description,
  lat: place.lat,
  lng: place.lng,
});
