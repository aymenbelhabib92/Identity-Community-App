import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { pinIcon } from './markers';
import s from './map.module.css';
import { TILE_ATTRIBUTION, TILE_URL } from './tiles';

/** A static map with one pin (meetup meeting point). */
export default function MiniMap({ lat, lng, zoom = 15 }: { lat: number; lng: number; zoom?: number }) {
  return (
    <MapContainer
      key={`${lat},${lng}`}
      center={[lat, lng]}
      zoom={zoom}
      className={s.map}
      zoomControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      boxZoom={false}
      keyboard={false}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
      <Marker position={[lat, lng]} icon={pinIcon} interactive={false} />
    </MapContainer>
  );
}
