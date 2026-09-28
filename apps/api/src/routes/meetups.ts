import {
  attendeeListSchema,
  formatDayDateTime,
  idParamsSchema,
  isStaff,
  MEETUP_ONGOING_HOURS,
  meetupCreateSchema,
  meetupListQuerySchema,
  meetupListSchema,
  meetupSchema,
  meetupUpdateSchema,
} from '@identity/shared';
import { and, asc, desc, eq, gte, lt } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { meetupRsvps, meetups, users, type MeetupRow } from '../db/schema';
import { AppError, conflict, fieldError, forbidden, notFound } from '../errors';
import { requirePermission } from '../plugins/auth';
import {
  audienceFor,
  canEditMeetup,
  canSeeMeetup,
  meetupStatus,
  toMeetupDto,
  toMeetupDtos,
  visibleToViewer,
} from '../services/meetups';
import { notify } from '../services/notifications';
import { audienceIds } from '../services/users';
import type { Viewer } from '../types';

const HOUR = 3_600_000;

export const meetupRoutes: FastifyPluginAsyncZod = async (app) => {
  async function loadVisible(id: string, viewer: Viewer): Promise<MeetupRow> {
    const [row] = await app.db.select().from(meetups).where(eq(meetups.id, id)).limit(1);
    // Meetups a member may not see are reported as missing.
    if (!row || !canSeeMeetup(row, viewer)) throw notFound('Meetup');
    return row;
  }

  async function goingIds(meetupId: string): Promise<string[]> {
    const rows = await app.db.select({ userId: meetupRsvps.userId }).from(meetupRsvps).where(eq(meetupRsvps.meetupId, meetupId));
    return rows.map((row) => row.userId);
  }

  const when = (row: Pick<MeetupRow, 'startsAt'>) => formatDayDateTime(row.startsAt, app.config.timezone);

  app.get(
    '/meetups',
    {
      schema: {
        tags: ['meetups'],
        summary: 'Upcoming (including ongoing and cancelled) or past meetups visible to me',
        querystring: meetupListQuerySchema,
        response: { 200: meetupListSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const { scope, limit } = request.query;
      const cutoff = new Date(viewer.now.getTime() - MEETUP_ONGOING_HOURS * HOUR);
      const rows = await app.db
        .select()
        .from(meetups)
        .where(and(visibleToViewer(viewer), scope === 'upcoming' ? gte(meetups.startsAt, cutoff) : lt(meetups.startsAt, cutoff)))
        .orderBy(scope === 'upcoming' ? asc(meetups.startsAt) : desc(meetups.startsAt))
        .limit(limit);
      return { items: await toMeetupDtos(app.db, viewer, rows) };
    },
  );

  app.get(
    '/meetups/:id',
    {
      schema: { tags: ['meetups'], summary: 'Meetup details', params: idParamsSchema, response: { 200: meetupSchema } },
    },
    async (request) => {
      const row = await loadVisible(request.params.id, request.viewer);
      return toMeetupDto(app.db, request.viewer, row);
    },
  );

  app.post(
    '/meetups',
    {
      preHandler: requirePermission('meetups:create'),
      schema: {
        tags: ['meetups'],
        summary: 'Create a meetup (organizers)',
        description: 'Eligible members are notified. Secret meeting points are revealed `revealHoursBefore` hours before start.',
        body: meetupCreateSchema,
        response: { 201: meetupSchema },
      },
    },
    async (request, reply) => {
      const { viewer } = request;
      const body = request.body;
      const startsAt = new Date(body.startsAt);
      if (startsAt.getTime() < viewer.now.getTime() - HOUR) throw fieldError('startsAt', 'The start time is in the past.');

      const [row] = await app.db
        .insert(meetups)
        .values({
          title: body.title,
          description: body.description || null,
          visibility: body.visibility,
          startsAt,
          revealHoursBefore: body.revealHoursBefore ?? viewer.settings.revealHoursBefore,
          locationName: body.locationName || null,
          address: body.address || null,
          lat: body.lat ?? null,
          lng: body.lng ?? null,
          rules: body.rules === undefined ? viewer.settings.meetRules || null : body.rules || null,
          hostId: viewer.id,
        })
        .returning();

      const recipients = await audienceIds(app.db, viewer.settings, viewer.today, audienceFor(row!.visibility), viewer.id);
      await notify(app.db, recipients, {
        kind: 'meetup',
        title: `New meetup: ${row!.title}`,
        body: row!.visibility === 'secret' ? `${when(row!)} · meeting point revealed ${row!.revealHoursBefore}h before` : when(row!),
        link: `/meetups/${row!.id}`,
      });

      reply.code(201);
      return toMeetupDto(app.db, viewer, row!);
    },
  );

  app.patch(
    '/meetups/:id',
    {
      schema: {
        tags: ['meetups'],
        summary: 'Edit a meetup (host or admin)',
        description: 'Members who are going are notified when the time or meeting point changes.',
        params: idParamsSchema,
        body: meetupUpdateSchema,
        response: { 200: meetupSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const row = await loadVisible(request.params.id, viewer);
      if (!canEditMeetup(row, viewer)) throw forbidden();
      if (row.cancelledAt) throw conflict('CANCELLED', 'This meetup was cancelled.');

      const body = request.body;
      const patch: Partial<typeof meetups.$inferInsert> = {};
      if (body.title !== undefined) patch.title = body.title;
      if (body.description !== undefined) patch.description = body.description || null;
      if (body.visibility !== undefined) patch.visibility = body.visibility;
      if (body.startsAt !== undefined) patch.startsAt = new Date(body.startsAt);
      if (body.revealHoursBefore !== undefined) patch.revealHoursBefore = body.revealHoursBefore;
      if (body.locationName !== undefined) patch.locationName = body.locationName || null;
      if (body.address !== undefined) patch.address = body.address || null;
      if (body.lat !== undefined) patch.lat = body.lat;
      if (body.lng !== undefined) patch.lng = body.lng;
      if (body.rules !== undefined) patch.rules = body.rules || null;

      const [updated] = Object.keys(patch).length
        ? await app.db.update(meetups).set(patch).where(eq(meetups.id, row.id)).returning()
        : [row];

      const timeChanged = updated!.startsAt.getTime() !== row.startsAt.getTime();
      const placeChanged =
        updated!.lat !== row.lat || updated!.lng !== row.lng || updated!.locationName !== row.locationName;
      if (timeChanged || placeChanged) {
        await notify(app.db, (await goingIds(row.id)).filter((id) => id !== viewer.id), {
          kind: 'meetup',
          title: `Meetup updated: ${updated!.title}`,
          body: timeChanged ? `New time: ${when(updated!)}` : 'The meeting point changed.',
          link: `/meetups/${row.id}`,
        });
      }
      return toMeetupDto(app.db, viewer, updated!);
    },
  );

  app.post(
    '/meetups/:id/cancel',
    {
      schema: {
        tags: ['meetups'],
        summary: 'Cancel a meetup (host or admin)',
        params: idParamsSchema,
        response: { 200: meetupSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const row = await loadVisible(request.params.id, viewer);
      if (!canEditMeetup(row, viewer)) throw forbidden();
      if (row.cancelledAt) return toMeetupDto(app.db, viewer, row);

      const [updated] = await app.db
        .update(meetups)
        .set({ cancelledAt: viewer.now })
        .where(eq(meetups.id, row.id))
        .returning();
      await notify(app.db, (await goingIds(row.id)).filter((id) => id !== viewer.id), {
        kind: 'meetup',
        title: `Cancelled: ${row.title}`,
        body: when(row),
        link: `/meetups/${row.id}`,
      });
      return toMeetupDto(app.db, viewer, updated!);
    },
  );

  app.put(
    '/meetups/:id/rsvp',
    {
      schema: {
        tags: ['meetups'],
        summary: "I'm going",
        description: 'For secret meetups, confirming is what unlocks the meeting point at reveal time.',
        params: idParamsSchema,
        response: { 200: meetupSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const row = await loadVisible(request.params.id, viewer);
      const status = meetupStatus(row, viewer.now);
      if (status === 'cancelled') throw conflict('CANCELLED', 'This meetup was cancelled.');
      if (status === 'past') throw conflict('ENDED', 'This meetup has ended.');
      if (row.visibility !== 'public' && !viewer.hasAccess) {
        throw new AppError(403, 'MEMBERS_ONLY', 'Available to active members.');
      }
      await app.db.insert(meetupRsvps).values({ meetupId: row.id, userId: viewer.id }).onConflictDoNothing();
      return toMeetupDto(app.db, viewer, row);
    },
  );

  app.delete(
    '/meetups/:id/rsvp',
    {
      schema: {
        tags: ['meetups'],
        summary: "I'm not going anymore",
        params: idParamsSchema,
        response: { 200: meetupSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const row = await loadVisible(request.params.id, viewer);
      await app.db
        .delete(meetupRsvps)
        .where(and(eq(meetupRsvps.meetupId, row.id), eq(meetupRsvps.userId, viewer.id)));
      return toMeetupDto(app.db, viewer, row);
    },
  );

  app.get(
    '/meetups/:id/attendees',
    {
      schema: {
        tags: ['meetups'],
        summary: 'Who is going (host and staff)',
        params: idParamsSchema,
        response: { 200: attendeeListSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const row = await loadVisible(request.params.id, viewer);
      if (row.hostId !== viewer.id && !(viewer.hasAccess && isStaff(viewer.role))) throw forbidden();
      const rows = await app.db
        .select({
          id: users.id,
          fullName: users.fullName,
          role: users.role,
          badgeNumber: users.badgeNumber,
          car: users.car,
          rsvpAt: meetupRsvps.createdAt,
        })
        .from(meetupRsvps)
        .innerJoin(users, eq(meetupRsvps.userId, users.id))
        .where(eq(meetupRsvps.meetupId, row.id))
        .orderBy(asc(meetupRsvps.createdAt));
      return { items: rows.map((r) => ({ ...r, rsvpAt: r.rsvpAt.toISOString() })) };
    },
  );
};
