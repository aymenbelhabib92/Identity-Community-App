import 'leaflet/dist/leaflet.css';
import {
  DEFAULT_MAP_CENTER,
  formatRelative,
  initials,
  ROLE_LABELS,
  type LatLng,
  type MapMeetup,
  type MapMember,
  type Place,
} from '@identity/shared';
import { useQuery } from '@tanstack/react-query';
import L, { type Map as LeafletMap } from 'leaflet';
import { Car, Clock, LocateFixed, Lock, MapPin, Navigation, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AttributionControl, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { useNavigate } from 'react-router';
import Supercluster, { type PointFeature } from 'supercluster';
import { clusterIcon, meetupIcon, memberIcon, meIcon, pinIcon } from '../../components/map/markers';
import mapStyles from '../../components/map/map.module.css';
import { MAX_ZOOM, TILE_ATTRIBUTION, TILE_URL } from '../../components/map/tiles';
import {
  Avatar,
  ButtonLink,
  IconTile,
  List,
  ListRow,
  Segmented,
  SectionFooter,
  Sheet,
  Toggle,
} from '../../components/ui';
import { api } from '../../lib/api';
import { useUser } from '../../lib/auth';
import { errorMessage } from '../../lib/errors';
import { useDebounced } from '../../lib/hooks';
import { useLocationSharing } from '../../lib/location';
import { useMapMeetups, useMapMembers } from '../../lib/queries';
import s from './map-screen.module.css';

type Layer = 'members' | 'meetups';

export default function MapScreen() {
  const user = useUser();
  const location = useLocationSharing();
  const [map, setMap] = useState<LeafletMap | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const [bottomHeight, setBottomHeight] = useState(140);

  // Keep the map attribution just above the bottom card, whatever its height.
  useEffect(() => {
    const element = bottom.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setBottomHeight(entry!.contentRect.height));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [layer, setLayer] = useState<Layer>('members');
  const [selected, setSelected] = useState<MapMember | null>(null);
  const [group, setGroup] = useState<MapMember[] | null>(null);
  const [placePin, setPlacePin] = useState<LatLng | null>(null);

  const members = useMapMembers(user.hasAccess);
  const meetups = useMapMeetups();
  const memberList = useMemo(() => members.data?.items ?? [], [members.data]);

  const flyTo = (point: LatLng, zoom = 15) => map?.flyTo([point.lat, point.lng], zoom, { duration: 0.7 });

  return (
    <div className={s.screen} style={{ '--card-height': `${bottomHeight + 18}px` } as CSSProperties}>
      <div className={s.mapArea}>
        <MapContainer
          ref={setMap}
          center={[DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng]}
          zoom={12}
          maxZoom={MAX_ZOOM}
          zoomControl={false}
          attributionControl={false}
          className={mapStyles.map}
        >
          <AttributionControl position="bottomleft" />
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={MAX_ZOOM} />
          <InitialView position={location.sharing ? location.position : null} members={memberList} />
          {layer === 'members' && user.hasAccess && (
            <MemberLayer members={memberList} onSelect={setSelected} onGroup={setGroup} />
          )}
          {layer === 'meetups' && <MeetupLayer meetups={meetups.data?.items ?? []} />}
          {location.sharing && location.position && (
            <Marker
              position={[location.position.lat, location.position.lng]}
              icon={meIcon}
              interactive={false}
              keyboard={false}
              zIndexOffset={1000}
            />
          )}
          {placePin && <Marker position={[placePin.lat, placePin.lng]} icon={pinIcon} interactive={false} />}
        </MapContainer>
      </div>

      <div className={s.top}>
        <SearchPanel
          members={user.hasAccess ? memberList : []}
          onMember={(member) => {
            flyTo(member, 15);
            setSelected(member);
          }}
          onPlace={(place) => {
            setPlacePin(place);
            flyTo(place, 15);
          }}
        />
        <Segmented
          className={s.segmented}
          label="Map layer"
          value={layer}
          onChange={setLayer}
          options={[
            { value: 'members', label: 'Members' },
            { value: 'meetups', label: 'Meetups' },
          ]}
        />
      </div>

      <div className={s.bottom} ref={bottom}>
        {location.sharing && location.position && (
          <button type="button" className={s.recenter} onClick={() => flyTo(location.position!, 14)} aria-label="Show my position">
            <LocateFixed aria-hidden />
          </button>
        )}
        {user.hasAccess ? <ShareCard /> : <LockedCard />}
      </div>

      <MemberSheet member={selected} onClose={() => setSelected(null)} />
      <Sheet open={group !== null} onClose={() => setGroup(null)} title="Members here">
        <List>
          {group?.map((member) => (
            <ListRow
              key={member.id}
              leading={<Avatar name={member.fullName} size={36} />}
              title={member.fullName}
              subtitle={member.car ?? undefined}
              onClick={() => {
                setGroup(null);
                setSelected(member);
              }}
            />
          ))}
        </List>
      </Sheet>
    </div>
  );
}

/** Centre on my position, or on the members, the first time they are known. */
function InitialView({ position, members }: { position: LatLng | null; members: MapMember[] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    if (position) {
      map.setView([position.lat, position.lng], 13);
      done.current = true;
    } else if (members.length > 0) {
      map.fitBounds(L.latLngBounds(members.map((m) => [m.lat, m.lng] as [number, number])).pad(0.35), { maxZoom: 13 });
      done.current = true;
    }
  }, [map, position, members]);
  return null;
}

type MemberFeature = PointFeature<{ member: MapMember }>;

function MemberLayer({
  members,
  onSelect,
  onGroup,
}: {
  members: MapMember[];
  onSelect: (member: MapMember) => void;
  onGroup: (members: MapMember[]) => void;
}) {
  const map = useMap();
  const [view, setView] = useState(() => ({ bounds: map.getBounds(), zoom: map.getZoom() }));
  useMapEvents({ moveend: () => setView({ bounds: map.getBounds(), zoom: map.getZoom() }) });

  const index = useMemo(() => {
    const cluster = new Supercluster<{ member: MapMember }>({ radius: 56, maxZoom: MAX_ZOOM - 1 });
    cluster.load(
      members.map<MemberFeature>((member) => ({
        type: 'Feature',
        properties: { member },
        geometry: { type: 'Point', coordinates: [member.lng, member.lat] },
      })),
    );
    return cluster;
  }, [members]);

  const { bounds, zoom } = view;
  const features = index.getClusters(
    [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
    Math.round(zoom),
  );

  return (
    <>
      {features.map((feature) => {
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        if ('cluster' in feature.properties && feature.properties.cluster) {
          const clusterId = feature.properties.cluster_id;
          const count = feature.properties.point_count;
          return (
            <Marker
              key={`cluster-${clusterId}`}
              position={[lat, lng]}
              icon={clusterIcon(count)}
              title={`${count} members`}
              eventHandlers={{
                click: () => {
                  const expansion = index.getClusterExpansionZoom(clusterId);
                  // Members sharing the same ~500 m cell never split apart: list them instead.
                  if (expansion > MAX_ZOOM - 1 || zoom >= MAX_ZOOM - 1) {
                    onGroup(index.getLeaves(clusterId, Infinity).map((leaf) => leaf.properties.member));
                  } else {
                    map.flyTo([lat, lng], expansion, { duration: 0.6 });
                  }
                },
              }}
            />
          );
        }
        const { member } = (feature as MemberFeature).properties;
        return (
          <Marker
            key={member.id}
            position={[lat, lng]}
            icon={memberIcon(initials(member.fullName))}
            title={member.fullName}
            eventHandlers={{ click: () => onSelect(member) }}
          />
        );
      })}
    </>
  );
}

function MeetupLayer({ meetups }: { meetups: MapMeetup[] }) {
  const navigate = useNavigate();
  return (
    <>
      {meetups.map((meetup) => (
        <Marker
          key={meetup.id}
          position={[meetup.lat, meetup.lng]}
          icon={meetupIcon(meetup.visibility)}
          title={meetup.title}
          eventHandlers={{ click: () => navigate(`/meetups/${meetup.id}`) }}
        />
      ))}
    </>
  );
}

function SearchPanel({
  members,
  onMember,
  onPlace,
}: {
  members: MapMember[];
  onMember: (member: MapMember) => void;
  onPlace: (place: Place) => void;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const term = query.trim().toLowerCase();
  const debounced = useDebounced(query.trim());

  const places = useQuery({
    queryKey: ['geo', debounced],
    queryFn: () => api.geo.search(debounced),
    enabled: debounced.length >= 3,
    staleTime: 10 * 60_000,
  });

  const matches = term ? members.filter((member) => member.fullName.toLowerCase().includes(term)).slice(0, 5) : [];
  const open = focused && term.length > 0;
  const done = () => {
    setQuery('');
    setFocused(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <>
      <label className={s.search}>
        <Search aria-hidden />
        <input
          type="search"
          placeholder="Search members or places"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          aria-label="Search members or places"
        />
        {query && (
          <button type="button" className={s.clear} onClick={() => setQuery('')} aria-label="Clear search">
            <X aria-hidden strokeWidth={3} />
          </button>
        )}
      </label>

      {open && (
        <div className={s.results}>
          {matches.length > 0 && (
            <>
              <p className={s.resultsTitle}>Members</p>
              {matches.map((member) => (
                <ListRow
                  key={member.id}
                  leading={<Avatar name={member.fullName} size={32} />}
                  title={member.fullName}
                  subtitle={member.car ?? undefined}
                  onClick={() => {
                    onMember(member);
                    done();
                  }}
                />
              ))}
            </>
          )}
          {debounced.length >= 3 && (
            <>
              <p className={s.resultsTitle}>Places</p>
              {places.isPending && <p className={s.resultsEmpty}>Searching…</p>}
              {places.error && <p className={s.resultsEmpty}>{errorMessage(places.error)}</p>}
              {places.data?.items.length === 0 && <p className={s.resultsEmpty}>No place found.</p>}
              {places.data?.items.map((place) => (
                <ListRow
                  key={`${place.lat},${place.lng}`}
                  icon={<MapPin />}
                  title={place.name}
                  subtitle={place.address || undefined}
                  onClick={() => {
                    onPlace(place);
                    done();
                  }}
                />
              ))}
            </>
          )}
          {matches.length === 0 && debounced.length < 3 && <p className={s.resultsEmpty}>Keep typing…</p>}
        </div>
      )}
    </>
  );
}

function ShareCard() {
  const { sharing, error, enable, disable } = useLocationSharing();
  const [pending, setPending] = useState<boolean | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const toggle = async (next: boolean) => {
    setPending(next);
    setFailure(null);
    try {
      await (next ? enable() : disable());
    } catch (err) {
      setFailure(errorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const checked = pending ?? sharing;
  const message = failure ?? (sharing ? error : null);

  return (
    <div className={s.card}>
      <div className={s.shareRow}>
        <IconTile color="blue" large>
          <Navigation />
        </IconTile>
        <div className={s.shareText}>
          <p className={s.shareTitle}>Share my location</p>
          <p className={s.shareSub}>
            {checked ? 'On · approximate position (± 500 m)' : 'Off · you are hidden from the map'}
          </p>
        </div>
        <Toggle checked={checked} onChange={(next) => void toggle(next)} label="Share my location" disabled={pending !== null} />
      </div>
      {message && <p className={s.shareError}>{message}</p>}
      <p className={s.shareFoot}>
        <Lock aria-hidden />
        Visible to active members only · never your exact address
      </p>
    </div>
  );
}

function LockedCard() {
  return (
    <div className={s.card}>
      <div className={s.shareRow}>
        <IconTile color="gray" large>
          <Lock />
        </IconTile>
        <div className={s.shareText}>
          <p className={s.shareTitle}>Member map</p>
          <p className={s.shareSub}>Opens once your membership is active</p>
        </div>
      </div>
      <p className={s.lockedText}>Active members see each other here and can share their approximate position.</p>
      <ButtonLink to="/pass" size="small">
        View my membership
      </ButtonLink>
    </div>
  );
}

function sharedAgo(date: string): string {
  const relative = formatRelative(date);
  if (relative === 'now') return 'Just now';
  return /^\d+[mhd]$/.test(relative) ? `${relative} ago` : relative;
}

function MemberSheet({ member, onClose }: { member: MapMember | null; onClose: () => void }) {
  return (
    <Sheet open={member !== null} onClose={onClose}>
      {member && (
        <>
          <div className={s.memberHead}>
            <Avatar name={member.fullName} size={56} />
            <div>
              <p className={s.memberName}>{member.fullName}</p>
              <p className={s.memberRole}>{ROLE_LABELS[member.role]}</p>
            </div>
          </div>
          <List>
            <ListRow icon={<Car />} title="Car" value={member.car ?? '—'} />
            <ListRow icon={<Clock />} title="Position shared" value={sharedAgo(member.updatedAt)} />
          </List>
          <SectionFooter>Approximate position (± 500 m). Never share it outside the club.</SectionFooter>
        </>
      )}
    </Sheet>
  );
}
