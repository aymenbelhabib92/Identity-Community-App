import 'leaflet/dist/leaflet.css';
import {
  CLUB_PLACE_CATEGORIES,
  CLUB_PLACE_CATEGORY_LABELS,
  DEFAULT_MAP_CENTER,
  RED_ZONE_RADIUS,
  t,
  type ClubPlace,
  type ClubPlaceCategory,
  type LatLng,
  type RedZone,
} from '@identity/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import L, { type LeafletMouseEvent, type Map as LeafletMap } from 'leaflet';
import { ChevronLeft, MapPin, Search, ShieldAlert, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { Link, Navigate } from 'react-router';
import { PlaceLayer, RED_ZONE_STYLE, RedZoneLayer } from '../../components/map/ClubLayers';
import mapStyles from '../../components/map/map.module.css';
import { pinIcon } from '../../components/map/markers';
import { MAX_ZOOM, TILE_ATTRIBUTION, useTileUrl } from '../../components/map/tiles';
import {
  Button,
  ErrorState,
  FieldErrors,
  FormList,
  FormRow,
  IconTile,
  Input,
  ListRow,
  Segmented,
  Sheet,
  TextArea,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useCan } from '../../lib/auth';
import { cx } from '../../lib/cx';
import { errorMessage, fieldErrors } from '../../lib/errors';
import { useDebounced } from '../../lib/hooks';
import { keys, useMapPlaces, useMapZones } from '../../lib/queries';
import mapScreen from '../map/map-screen.module.css';
import s from './admin-places.module.css';

/** What the sheet edits: a new point (place or zone), or an existing place or zone. */
type Editing = { kind: 'new'; point: LatLng } | { kind: 'place'; place: ClubPlace } | { kind: 'zone'; zone: RedZone };

function ClickToAdd({ onAdd }: { onAdd: (point: LatLng) => void }) {
  useMapEvents({ click: (event: LeafletMouseEvent) => onAdd({ lat: event.latlng.lat, lng: event.latlng.lng }) });
  return null;
}

/** Frames every place and zone, once they are loaded. */
function FitOnce({ points }: { points: LatLng[] | null }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !points || points.length === 0) return;
    done.current = true;
    map.fitBounds(L.latLngBounds(points.map((point) => [point.lat, point.lng] as [number, number])).pad(0.2), { maxZoom: 14 });
  }, [map, points]);
  return null;
}

/** The admins' map: places shown to members, and red zones where positions are never shown. */
export default function AdminPlaces() {
  const canManage = useCan('places:manage');
  const tileUrl = useTileUrl();
  const places = useMapPlaces();
  const zones = useMapZones();
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  // Live preview of the zone being drawn or resized.
  const [preview, setPreview] = useState<{ center: LatLng; radius: number } | null>(null);

  if (!canManage) return <Navigate to="/admin" replace />;

  const placeList = places.data?.items ?? [];
  const zoneList = zones.data?.items ?? [];
  const everything = places.data && zones.data ? [...placeList, ...zoneList] : null;
  const close = () => {
    setEditing(null);
    setPreview(null);
  };
  const editedZoneId = editing?.kind === 'zone' ? editing.zone.id : null;

  return (
    <div className={mapScreen.screen}>
      <div className={mapScreen.mapArea}>
        <MapContainer
          ref={setMap}
          center={[DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng]}
          zoom={12}
          maxZoom={MAX_ZOOM}
          zoomControl={false}
          className={mapStyles.map}
        >
          <TileLayer key={tileUrl} url={tileUrl} attribution={TILE_ATTRIBUTION} maxZoom={MAX_ZOOM} />
          <ClickToAdd onAdd={(point) => setEditing({ kind: 'new', point })} />
          <FitOnce points={everything} />
          <RedZoneLayer
            zones={zoneList.filter((zone) => zone.id !== editedZoneId)}
            onSelect={(zone) => {
              setEditing({ kind: 'zone', zone });
              // The zone being edited is drawn by the preview, which follows the radius.
              setPreview({ center: zone, radius: zone.radius });
            }}
          />
          {preview && (
            <Circle
              center={[preview.center.lat, preview.center.lng]}
              radius={preview.radius}
              pathOptions={{ ...RED_ZONE_STYLE, className: cx(mapStyles.redZone, mapStyles.redZoneSelected) }}
              interactive={false}
            />
          )}
          <PlaceLayer places={placeList} onSelect={(place) => setEditing({ kind: 'place', place })} />
          {editing?.kind === 'new' && <Marker position={[editing.point.lat, editing.point.lng]} icon={pinIcon} interactive={false} />}
        </MapContainer>
      </div>

      <div className={mapScreen.top}>
        <div className={s.topRow}>
          <Link to="/admin" className={s.back} aria-label={t('Admin')}>
            <ChevronLeft aria-hidden strokeWidth={2.4} />
          </Link>
          <PlaceSearch onFound={(point) => map?.flyTo([point.lat, point.lng], 16, { duration: 0.7 })} />
        </div>
      </div>

      <div className={mapScreen.bottom}>
        <div className={mapScreen.card}>
          <div className={mapScreen.shareRow}>
            <IconTile color="purple" large>
              <MapPin />
            </IconTile>
            <div className={mapScreen.shareText}>
              <p className={mapScreen.shareTitle}>{t('Places & red zones')}</p>
              <p className={mapScreen.shareSub}>
                {t('{places} places · {zones} red zones', { places: placeList.length, zones: zoneList.length })}
              </p>
            </div>
          </div>
          <p className={s.hint}>{t('Tap the map to add a place or a red zone. Tap one to change or remove it.')}</p>
        </div>
      </div>

      <EditorSheet key={editorKey(editing)} editing={editing} onClose={close} onPreview={setPreview} />
    </div>
  );
}

const editorKey = (editing: Editing | null) =>
  !editing ? 'none' : editing.kind === 'new' ? `new:${editing.point.lat},${editing.point.lng}` : `${editing.kind}:${editing.kind === 'place' ? editing.place.id : editing.zone.id}`;

function PlaceSearch({ onFound }: { onFound: (point: LatLng) => void }) {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query.trim());
  const results = useQuery({
    queryKey: ['geo', debounced],
    queryFn: () => api.geo.search(debounced),
    enabled: debounced.length >= 3,
    staleTime: 10 * 60_000,
  });
  return (
    <div className={s.searchBox}>
      <label className={mapScreen.search}>
        <Search aria-hidden />
        <input
          type="search"
          placeholder={t('Search a place or address')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t('Search a place')}
        />
        {query && (
          <button type="button" className={mapScreen.clear} onClick={() => setQuery('')} aria-label={t('Clear search')}>
            <X aria-hidden strokeWidth={3} />
          </button>
        )}
      </label>
      {query && debounced.length >= 3 && (
        <div className={cx(mapScreen.results, s.results)}>
          {results.isPending && <p className={mapScreen.resultsEmpty}>{t('Searching…')}</p>}
          {results.error && <p className={mapScreen.resultsEmpty}>{errorMessage(results.error)}</p>}
          {results.data?.items.length === 0 && <p className={mapScreen.resultsEmpty}>{t('No place found.')}</p>}
          {results.data?.items.map((place) => (
            <ListRow
              key={`${place.lat},${place.lng}`}
              icon={<MapPin />}
              title={place.name}
              subtitle={place.address || undefined}
              onClick={() => {
                onFound(place);
                setQuery('');
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type Kind = 'place' | 'zone';

function EditorSheet({
  editing,
  onClose,
  onPreview,
}: {
  editing: Editing | null;
  onClose: () => void;
  onPreview: (preview: { center: LatLng; radius: number } | null) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const existingPlace = editing?.kind === 'place' ? editing.place : null;
  const existingZone = editing?.kind === 'zone' ? editing.zone : null;
  const point: LatLng | null = editing?.kind === 'new' ? editing.point : (existingPlace ?? existingZone);

  const [kind, setKind] = useState<Kind>(existingZone ? 'zone' : 'place');
  const [name, setName] = useState(existingPlace?.name ?? existingZone?.name ?? '');
  const [category, setCategory] = useState<ClubPlaceCategory>(existingPlace?.category ?? 'spot');
  const [description, setDescription] = useState(existingPlace?.description ?? '');
  const [radius, setRadius] = useState<number>(existingZone?.radius ?? RED_ZONE_RADIUS.default);

  const showPreview = (nextKind: Kind, nextRadius: number) =>
    onPreview(point && nextKind === 'zone' ? { center: point, radius: nextRadius } : null);

  const done = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: keys.mapPlaces });
    void queryClient.invalidateQueries({ queryKey: keys.mapZones });
    // Members' positions inside a new or bigger zone disappear at once.
    void queryClient.invalidateQueries({ queryKey: keys.mapMembers });
    toast(message, 'success');
    onClose();
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!point) return;
      if (kind === 'place') {
        const body = { name, category, description: description.trim() || null };
        if (existingPlace) await api.admin.updatePlace(existingPlace.id, body);
        else await api.admin.createPlace({ ...body, lat: point.lat, lng: point.lng });
      } else if (existingZone) {
        await api.admin.updateZone(existingZone.id, { name, radius });
      } else {
        await api.admin.createZone({ name, radius, lat: point.lat, lng: point.lng });
      }
    },
    onSuccess: () => done(kind === 'place' ? t('Place saved') : t('Red zone saved')),
  });
  const remove = useMutation({
    mutationFn: async () => {
      if (existingPlace) await api.admin.removePlace(existingPlace.id);
      if (existingZone) await api.admin.removeZone(existingZone.id);
    },
    onSuccess: () => done(existingPlace ? t('Place removed') : t('Red zone removed')),
  });
  const errors = fieldErrors(save.error);

  const title = existingPlace ? t('Place') : existingZone ? t('Red zone') : t('Add here');

  return (
    <Sheet
      open={editing !== null}
      onClose={() => {
        onPreview(null);
        onClose();
      }}
      title={title}
    >
      <div className={s.form}>
        {editing?.kind === 'new' && (
          <Segmented
            label={t('What to add')}
            value={kind}
            onChange={(next) => {
              setKind(next);
              showPreview(next, radius);
            }}
            options={[
              { value: 'place', label: t('Place') },
              { value: 'zone', label: t('Red zone') },
            ]}
          />
        )}

        <div>
          <FormList>
            <FormRow label={t('Name')} htmlFor="place-name" invalid={Boolean(errors.name)}>
              <Input
                id="place-name"
                value={name}
                maxLength={80}
                placeholder={kind === 'place' ? t('e.g. Lac 2 parking') : t('e.g. Residential streets')}
                onChange={(event) => setName(event.target.value)}
              />
            </FormRow>
          </FormList>
          <FieldErrors errors={[errors.name]} />
        </div>

        {kind === 'place' ? (
          <>
            <div className={s.chips} role="radiogroup" aria-label={t('Category')}>
              {CLUB_PLACE_CATEGORIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={value === category}
                  className={cx(s.chip, value === category && s.chipActive)}
                  onClick={() => setCategory(value)}
                >
                  {t(CLUB_PLACE_CATEGORY_LABELS[value])}
                </button>
              ))}
            </div>
            <TextArea
              value={description}
              maxLength={500}
              placeholder={t('Description (optional): opening hours, discount for members…')}
              onChange={(event) => setDescription(event.target.value)}
              aria-label={t('Description')}
            />
          </>
        ) : (
          <>
            <label className={s.radius}>
              <span className={s.radiusHead}>
                <span>{t('Radius')}</span>
                <strong>{radius >= 1000 ? `${(radius / 1000).toLocaleString()} km` : `${radius} m`}</strong>
              </span>
              <input
                type="range"
                min={RED_ZONE_RADIUS.min}
                max={RED_ZONE_RADIUS.max}
                step={50}
                value={radius}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setRadius(next);
                  showPreview('zone', next);
                }}
              />
            </label>
            <p className={s.zoneText}>
              <ShieldAlert aria-hidden />
              {t('Members inside are hidden from the map, and see a red alert while there. Every member sees the zone.')}
            </p>
          </>
        )}

        {save.error && Object.keys(errors).length === 0 && <ErrorState error={save.error} />}
        {remove.error && <ErrorState error={remove.error} />}
        <Button loading={save.isPending} disabled={name.trim().length < 2} onClick={() => save.mutate()}>
          {existingPlace || existingZone ? t('Save') : kind === 'place' ? t('Add the place') : t('Add the red zone')}
        </Button>
        {(existingPlace || existingZone) && (
          <Button variant="danger" icon={<Trash2 aria-hidden />} loading={remove.isPending} onClick={() => remove.mutate()}>
            {existingPlace ? t('Remove the place') : t('Remove the red zone')}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
