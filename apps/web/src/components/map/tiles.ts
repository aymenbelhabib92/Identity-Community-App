/**
 * Base map. CARTO's dark basemap (OpenStreetMap data) needs no API key; swap it
 * with VITE_MAP_TILE_URL, or replace Leaflet by Google Maps here if the club
 * goes with Google.
 */
export const TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL || 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

export const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export const MAX_ZOOM = 18;
