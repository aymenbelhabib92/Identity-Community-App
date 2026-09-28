import { geoSearchQuerySchema, placeListSchema, type Place } from '@identity/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError } from '../errors';

interface NominatimResult {
  display_name: string;
  name?: string;
  lat: string;
  lon: string;
}

const CACHE_SIZE = 500;

/**
 * Place search through OpenStreetMap Nominatim, proxied so the usage policy
 * (identifying User-Agent, caching, low volume) is respected in one place.
 * Swap for Google Places here if the club moves to Google Maps.
 */
export const geoRoutes: FastifyPluginAsyncZod = async (app) => {
  const cache = new Map<string, Place[]>();
  const unavailable = () => new AppError(502, 'GEOCODER_UNAVAILABLE', 'Place search is unavailable right now.');

  app.get(
    '/geo/search',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['map'],
        summary: 'Search places (addresses, landmarks)',
        querystring: geoSearchQuerySchema,
        response: { 200: placeListSchema },
      },
    },
    async (request) => {
      const { q } = request.query;
      const key = q.toLowerCase();
      const cached = cache.get(key);
      if (cached) return { items: cached };

      const { geocoder } = app.config;
      const url = new URL(`${geocoder.url}/search`);
      url.searchParams.set('q', q);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', '6');
      url.searchParams.set('accept-language', 'en');
      if (geocoder.countryCodes) url.searchParams.set('countrycodes', geocoder.countryCodes);
      if (geocoder.email) url.searchParams.set('email', geocoder.email);

      let results: NominatimResult[];
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'IdentityCommunityApp/0.1 (car club app)' },
          signal: AbortSignal.timeout(6_000),
        });
        if (!response.ok) throw unavailable();
        results = (await response.json()) as NominatimResult[];
      } catch (err) {
        request.log.warn({ err }, 'geocoder request failed');
        throw unavailable();
      }

      const items = results.map((result) => {
        const [first = result.display_name, ...rest] = result.display_name.split(', ');
        return {
          name: result.name || first,
          address: (result.name && result.name !== first ? [first, ...rest] : rest).join(', '),
          lat: Number(result.lat),
          lng: Number(result.lon),
        };
      });
      if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
      cache.set(key, items);
      return { items };
    },
  );
};
