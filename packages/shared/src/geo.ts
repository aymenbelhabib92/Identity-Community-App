export interface LatLng {
  lat: number;
  lng: number;
}

/** Shared positions are snapped to a grid of this size — never the exact spot. */
export const LOCATION_PRECISION_METERS = 500;

const METERS_PER_DEGREE_LAT = 111_320;

/**
 * Snaps a position to the centre of a ~500 m grid cell. Snapping (rather than
 * random noise) keeps the published point stable, so repeated updates from the
 * same place cannot be averaged back to the real address.
 */
export function approximateLocation(point: LatLng, cellMeters = LOCATION_PRECISION_METERS): LatLng {
  const latStep = cellMeters / METERS_PER_DEGREE_LAT;
  const lat = (Math.floor(point.lat / latStep) + 0.5) * latStep;
  const lngStep = cellMeters / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
  const lng = (Math.floor(point.lng / lngStep) + 0.5) * lngStep;
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Tunis — default map centre. */
export const DEFAULT_MAP_CENTER: LatLng = { lat: 36.8065, lng: 10.1815 };

/** Opens the platform's maps app (Google Maps on Android/web, Apple Maps redirects on iOS). */
export function directionsUrl(point: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`;
}
