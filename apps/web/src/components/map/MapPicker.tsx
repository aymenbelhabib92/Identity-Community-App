import 'leaflet/dist/leaflet.css';
import { DEFAULT_MAP_CENTER, t, type LatLng, type Place } from '@identity/shared';
import { useQuery } from '@tanstack/react-query';
import type { LeafletMouseEvent, Map as LeafletMap, Marker as LeafletMarker } from 'leaflet';
import { LocateFixed, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import { api } from '../../lib/api';
import { cx } from '../../lib/cx';
import { errorMessage } from '../../lib/errors';
import { useDebounced } from '../../lib/hooks';
import { clubPlaceAsPlace, clubPlaceSubtitle, matchClubPlaces } from '../../lib/places';
import { useMapPlaces } from '../../lib/queries';
import { Button } from '../ui';
import { PlaceLayer } from './ClubLayers';
import { pinIcon } from './markers';
import s from './map.module.css';
import { TILE_ATTRIBUTION, useTileUrl } from './tiles';

function ClickToPlace({ onPlace }: { onPlace: (point: LatLng) => void }) {
  useMapEvents({ click: (event: LeafletMouseEvent) => onPlace({ lat: event.latlng.lat, lng: event.latlng.lng }) });
  return null;
}

/** Choose a meeting point: search a place, tap the map, or drag the pin. */
export default function MapPicker({
  value,
  onChange,
  onPlaceFound,
}: {
  value: LatLng | null;
  onChange: (point: LatLng | null) => void;
  onPlaceFound?: (place: Place) => void;
}) {
  const map = useRef<LeafletMap | null>(null);
  const tileUrl = useTileUrl();
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const debounced = useDebounced(query.trim());

  const places = useQuery({
    queryKey: ['geo', debounced],
    queryFn: () => api.geo.search(debounced),
    enabled: debounced.length >= 3,
    staleTime: 10 * 60_000,
  });

  const moveTo = (point: LatLng, zoom = 16) => {
    onChange(point);
    map.current?.flyTo([point.lat, point.lng], zoom, { duration: 0.6 });
  };

  const choose = (place: Place) => {
    moveTo({ lat: place.lat, lng: place.lng });
    onPlaceFound?.(place);
    setQuery('');
  };

  // The club's places (added by admins) come first, from the first letter typed.
  const clubPlaces = useMapPlaces();
  const clubMatches = matchClubPlaces(clubPlaces.data?.items ?? [], query);

  const useMyPosition = () => {
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        moveTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setLocateError(t('Could not get your position.'));
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const center = value ?? DEFAULT_MAP_CENTER;

  return (
    <div className={s.picker}>
      <label className={s.search}>
        <Search aria-hidden />
        <input
          type="search"
          placeholder={t('Search a place or address')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t('Search a place')}
        />
      </label>

      {query.trim() && (clubMatches.length > 0 || debounced.length >= 3) && (
        <div className={s.results} role="listbox" aria-label={t('Places')}>
          {clubMatches.length > 0 && (
            <>
              <p className={s.resultsTitle}>{t('Club places')}</p>
              {clubMatches.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className={s.result}
                  onClick={() => choose(clubPlaceAsPlace(place))}
                >
                  <span className={s.resultName}>
                    <span className={cx(s.resultDot, s[`place_${place.category}`])} aria-hidden />
                    {place.name}
                  </span>
                  <span className={s.resultAddress}>{clubPlaceSubtitle(place)}</span>
                </button>
              ))}
            </>
          )}
          {debounced.length >= 3 && (
            <>
              <p className={s.resultsTitle}>{t('Map results')}</p>
              {places.isPending && <p className={s.status}>{t('Searching…')}</p>}
              {places.error && <p className={s.status}>{errorMessage(places.error)}</p>}
              {places.data?.items.length === 0 && <p className={s.status}>{t('No place found.')}</p>}
              {places.data?.items.map((place) => (
                <button
                  key={`${place.lat},${place.lng}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className={s.result}
                  onClick={() => choose(place)}
                >
                  <span className={s.resultName}>{place.name}</span>
                  {place.address && <span className={s.resultAddress}>{place.address}</span>}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      <div className={s.pickerMap}>
        <MapContainer ref={map} center={[center.lat, center.lng]} zoom={value ? 15 : 12} className={s.map} zoomControl>
          <TileLayer key={tileUrl} url={tileUrl} attribution={TILE_ATTRIBUTION} />
          <ClickToPlace onPlace={onChange} />
          {/* Tapping one of the club's places picks it. */}
          <PlaceLayer places={clubPlaces.data?.items ?? []} onSelect={(place) => choose(clubPlaceAsPlace(place))} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend: (event) => {
                  const { lat, lng } = (event.target as LeafletMarker).getLatLng();
                  onChange({ lat, lng });
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div className={s.pickerActions}>
        <Button
          variant="secondary"
          size="small"
          icon={<LocateFixed aria-hidden />}
          loading={locating}
          onClick={useMyPosition}
        >
          {t('Use my position')}
        </Button>
        {value && (
          <Button variant="plain" onClick={() => onChange(null)}>
            {t('Remove pin')}
          </Button>
        )}
      </div>
      {locateError && <p className={s.status}>{locateError}</p>}
    </div>
  );
}
