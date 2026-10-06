import {
  clubPlaceBodySchema,
  clubPlaceSchema,
  clubPlaceUpdateSchema,
  idParamsSchema,
  okResponseSchema,
  redZoneBodySchema,
  redZoneSchema,
  redZoneUpdateSchema,
} from '@identity/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { clubPlaces, redZones } from '../db/schema';
import { badRequest, notFound } from '../errors';
import { requirePermission } from '../plugins/auth';
import { toClubPlaceDto, toRedZoneDto } from '../services/zones';

/**
 * The admins' map: places shown to members, and red zones where members'
 * positions are never shown. Members read them with GET /map/places and /map/zones.
 */
export const placeRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', requirePermission('places:manage'));

  // ─── Places ──────────────────────────────────────────────────────────────

  app.post(
    '/admin/places',
    {
      schema: { tags: ['admin'], summary: 'Add a place to the map', body: clubPlaceBodySchema, response: { 201: clubPlaceSchema } },
    },
    async (request, reply) => {
      const { description, ...place } = request.body;
      const [row] = await app.db
        .insert(clubPlaces)
        .values({ ...place, description: description || null, createdById: request.viewer.id })
        .returning();
      reply.code(201);
      return toClubPlaceDto(row!);
    },
  );

  app.patch(
    '/admin/places/:id',
    {
      schema: {
        tags: ['admin'],
        summary: 'Change a place',
        params: idParamsSchema,
        body: clubPlaceUpdateSchema,
        response: { 200: clubPlaceSchema },
      },
    },
    async (request) => {
      const { description, ...changes } = request.body;
      const values = { ...changes, ...(description !== undefined && { description: description || null }) };
      if (Object.keys(values).length === 0) throw badRequest('VALIDATION', 'Nothing to update');
      const [row] = await app.db.update(clubPlaces).set(values).where(eq(clubPlaces.id, request.params.id)).returning();
      if (!row) throw notFound('Place');
      return toClubPlaceDto(row);
    },
  );

  app.delete(
    '/admin/places/:id',
    { schema: { tags: ['admin'], summary: 'Remove a place', params: idParamsSchema, response: { 200: okResponseSchema } } },
    async (request) => {
      const [row] = await app.db.delete(clubPlaces).where(eq(clubPlaces.id, request.params.id)).returning({ id: clubPlaces.id });
      if (!row) throw notFound('Place');
      return { ok: true as const };
    },
  );

  // ─── Red zones ───────────────────────────────────────────────────────────

  app.post(
    '/admin/zones',
    {
      schema: {
        tags: ['admin'],
        summary: 'Draw a red zone',
        description: "Members' positions inside it disappear from the map at once, and are not stored while they stay there.",
        body: redZoneBodySchema,
        response: { 201: redZoneSchema },
      },
    },
    async (request, reply) => {
      const [row] = await app.db
        .insert(redZones)
        .values({ ...request.body, createdById: request.viewer.id })
        .returning();
      reply.code(201);
      return toRedZoneDto(row!);
    },
  );

  app.patch(
    '/admin/zones/:id',
    {
      schema: {
        tags: ['admin'],
        summary: 'Change a red zone (name, centre, radius)',
        params: idParamsSchema,
        body: redZoneUpdateSchema,
        response: { 200: redZoneSchema },
      },
    },
    async (request) => {
      if (Object.keys(request.body).length === 0) throw badRequest('VALIDATION', 'Nothing to update');
      const [row] = await app.db.update(redZones).set(request.body).where(eq(redZones.id, request.params.id)).returning();
      if (!row) throw notFound('Red zone');
      return toRedZoneDto(row);
    },
  );

  app.delete(
    '/admin/zones/:id',
    { schema: { tags: ['admin'], summary: 'Remove a red zone', params: idParamsSchema, response: { 200: okResponseSchema } } },
    async (request) => {
      const [row] = await app.db.delete(redZones).where(eq(redZones.id, request.params.id)).returning({ id: redZones.id });
      if (!row) throw notFound('Red zone');
      return { ok: true as const };
    },
  );
};
