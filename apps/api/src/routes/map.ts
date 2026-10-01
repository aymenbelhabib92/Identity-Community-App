import { MEETUP_ONGOING_HOURS, mapMeetupListSchema, mapMemberListSchema, type MapMeetup } from '@identity/shared';
import { and, eq, gte, isNotNull, isNull, ne } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { meetups, memberLocations, users } from '../db/schema';
import { requireAccess } from '../plugins/auth';
import { toMeetupDtos, visibleToViewer } from '../services/meetups';
import { memberRefColumns, stateOf, toMemberRef } from '../services/users';

const HOUR = 3_600_000;

export const mapRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/map/members',
    {
      preHandler: requireAccess,
      schema: {
        tags: ['map'],
        summary: 'Members sharing their approximate position',
        description: 'Only active members, only recent positions (see `locationTtlHours`), never the requester.',
        response: { 200: mapMemberListSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const since = new Date(viewer.now.getTime() - viewer.settings.locationTtlHours * HOUR);
      const rows = await app.db
        .select({
          member: memberRefColumns(users),
          car: users.car,
          carPhotoIds: users.carPhotoIds,
          status: users.status,
          paidUntil: users.paidUntil,
          lat: memberLocations.lat,
          lng: memberLocations.lng,
          updatedAt: memberLocations.updatedAt,
        })
        .from(memberLocations)
        .innerJoin(users, eq(memberLocations.userId, users.id))
        .where(and(eq(users.locationSharing, true), gte(memberLocations.updatedAt, since), ne(users.id, viewer.id)));
      return {
        items: rows
          .filter((row) => stateOf({ ...row, role: row.member.role }, viewer.settings, viewer.today).hasAccess)
          .map((row) => ({
            ...toMemberRef(row.member, viewer.now)!,
            car: row.car,
            carPhotos: row.carPhotoIds,
            lat: row.lat,
            lng: row.lng,
            updatedAt: row.updatedAt.toISOString(),
          })),
      };
    },
  );

  app.get(
    '/map/meetups',
    {
      schema: {
        tags: ['map'],
        summary: 'Upcoming meetups whose meeting point I can see',
        response: { 200: mapMeetupListSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const cutoff = new Date(viewer.now.getTime() - MEETUP_ONGOING_HOURS * HOUR);
      const rows = await app.db
        .select()
        .from(meetups)
        .where(and(visibleToViewer(viewer), gte(meetups.startsAt, cutoff), isNull(meetups.cancelledAt), isNotNull(meetups.lat)));
      const items: MapMeetup[] = [];
      for (const meetup of await toMeetupDtos(app.db, viewer, rows)) {
        const { location } = meetup;
        if (location?.lat == null || location.lng == null) continue;
        items.push({
          id: meetup.id,
          title: meetup.title,
          visibility: meetup.visibility,
          startsAt: meetup.startsAt,
          locationName: location.name,
          lat: location.lat,
          lng: location.lng,
        });
      }
      return { items };
    },
  );
};
