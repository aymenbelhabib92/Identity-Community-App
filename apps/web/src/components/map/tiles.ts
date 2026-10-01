import { useResolvedTheme } from '../../lib/preferences';

/**
 * Base map. Stadia Maps' "Alidade Smooth" (OpenStreetMap data) matches the
 * app's look, in its dark or light version depending on the theme. It works
 * without a key on localhost; in production, register the domain on
 * stadiamaps.com (free tier) or point VITE_MAP_TILE_URL elsewhere — a custom URL
 * is then used for both themes. Switching to Google Maps later means replacing
 * Leaflet in this folder.
 */
const DARK_TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL || 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png';
const LIGHT_TILE_URL = DARK_TILE_URL.replace('/alidade_smooth_dark/', '/alidade_smooth/');

/** Tile URL for the current theme; the map redraws when the theme changes. */
export function useTileUrl(): string {
  return useResolvedTheme() === 'light' ? LIGHT_TILE_URL : DARK_TILE_URL;
}

export const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_ATTRIBUTION ||
  '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export const MAX_ZOOM = 18;
