import {
  CLUB_PLACE_CATEGORY_LABELS,
  directionsUrl,
  t,
  type ClubPlace,
  type RedZone,
} from '@identity/shared';
import { Navigation, ShieldAlert } from 'lucide-react';
import { Circle, Marker } from 'react-leaflet';
import { cx } from '../../lib/cx';
import { Button, Sheet } from '../ui';
import { placeIcon } from './markers';
import s from './map.module.css';
import sheet from './layers.module.css';

/**
 * Red circles (also set as Leaflet options, so they stay red even if the CSS of
 * map.module.css does not apply, e.g. with a canvas renderer).
 */
export const RED_ZONE_STYLE = { color: '#ff3b30', weight: 2.5, opacity: 1, fillColor: '#ff3b30', fillOpacity: 0.4 };

/** Red zones: red circles, on every layer of the map. */
export function RedZoneLayer({
  zones,
  selectedId,
  onSelect,
}: {
  zones: RedZone[];
  selectedId?: string | null;
  onSelect?: (zone: RedZone) => void;
}) {
  return (
    <>
      {zones.map((zone) => (
        <Circle
          key={zone.id}
          center={[zone.lat, zone.lng]}
          radius={zone.radius}
          pathOptions={{ ...RED_ZONE_STYLE, className: cx(s.redZone, zone.id === selectedId && s.redZoneSelected) }}
          interactive={Boolean(onSelect)}
          bubblingMouseEvents={false}
          eventHandlers={onSelect ? { click: () => onSelect(zone) } : undefined}
        />
      ))}
    </>
  );
}

export function PlaceLayer({ places, onSelect }: { places: ClubPlace[]; onSelect: (place: ClubPlace) => void }) {
  return (
    <>
      {places.map((place) => (
        <Marker
          key={place.id}
          position={[place.lat, place.lng]}
          icon={placeIcon(place.category)}
          title={place.name}
          bubblingMouseEvents={false}
          eventHandlers={{ click: () => onSelect(place) }}
        />
      ))}
    </>
  );
}

export const placeCategoryLabel = (place: Pick<ClubPlace, 'category'>) => t(CLUB_PLACE_CATEGORY_LABELS[place.category]);

/** A place, as members see it: category, description, directions. */
export function PlaceSheet({ place, onClose }: { place: ClubPlace | null; onClose: () => void }) {
  return (
    <Sheet open={place !== null} onClose={onClose} title={place?.name}>
      {place && (
        <div className={sheet.stack}>
          <p className={cx(sheet.category, sheet[place.category])}>{placeCategoryLabel(place)}</p>
          {place.description && <p className={sheet.text}>{place.description}</p>}
          <Button icon={<Navigation aria-hidden />} onClick={() => window.open(directionsUrl(place), '_blank', 'noopener')}>
            {t('Directions')}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

/** A red zone, as members see it. */
export function RedZoneSheet({ zone, onClose }: { zone: RedZone | null; onClose: () => void }) {
  return (
    <Sheet open={zone !== null} onClose={onClose} title={zone?.name}>
      {zone && (
        <div className={sheet.stack}>
          <p className={cx(sheet.category, sheet.red)}>
            <ShieldAlert aria-hidden />
            {t('Red zone')}
          </p>
          {zone.description && <p className={sheet.description}>{zone.description}</p>}
          <p className={sheet.text}>
            {t('Members are never shown on the map within {meters} m of this place, so that nobody can be found there.', {
              meters: zone.radius,
            })}
          </p>
        </div>
      )}
    </Sheet>
  );
}
