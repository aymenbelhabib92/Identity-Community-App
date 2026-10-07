import { CLUB_PLACE_CATEGORY_LABELS, t, type ClubPlace, type Place } from '@identity/shared';

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * The club's places (added by admins) matching a search, by name, description
 * or category. Searched on the device: they are few and already loaded.
 */
export function matchClubPlaces(places: readonly ClubPlace[], query: string, limit = 5): ClubPlace[] {
  const wanted = fold(query.trim());
  if (!wanted) return [];
  return places
    .filter((place) =>
      [place.name, place.description ?? '', t(CLUB_PLACE_CATEGORY_LABELS[place.category])].some((text) => fold(text).includes(wanted)),
    )
    .slice(0, limit);
}

/** "Garage · Diagnostics and tuning…" */
export const clubPlaceSubtitle = (place: ClubPlace) =>
  [t(CLUB_PLACE_CATEGORY_LABELS[place.category]), place.description].filter(Boolean).join(' · ');

/** A club place as a search result of the map (no street address). */
export const clubPlaceAsPlace = (place: ClubPlace): Place => ({ name: place.name, address: '', lat: place.lat, lng: place.lng });
