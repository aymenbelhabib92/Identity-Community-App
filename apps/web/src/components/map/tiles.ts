/**
 * Base map. Stadia Maps' "Alidade Smooth Dark" (OpenStreetMap data) matches the
 * app's look. It works without a key on localhost; in production, register the
 * domain on stadiamaps.com (free tier) or point VITE_MAP_TILE_URL elsewhere.
 * Switching to Google Maps later means replacing Leaflet in this folder.
 */
export const TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL || 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png';

export const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION ||
  '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export const MAX_ZOOM = 18;
