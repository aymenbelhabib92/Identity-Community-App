/** Web app version, from apps/web/package.json (see vite.config.ts). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_MAP_TILE_URL?: string;
  readonly VITE_MAP_ATTRIBUTION?: string;
}
