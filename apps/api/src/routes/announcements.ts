import {
  announcementCreateSchema,
  announcementListSchema,
  announcementSchema,
  can,
  idParamsSchema,
  isStaff,
  listQuerySchema,
  okResponseSchema,
  ROLE_LABELS,
  type Announcement,
  type AnnouncementAudience,
} from '@identity/shared';
import { desc, eq, inArray } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { announcements, users, type AnnouncementRow } from '../db/schema';
import { forbidden, notFound } from '../errors';
import { requirePermission } from '../plugins/auth';
import { notify } from '../services/notifications';
import { audienceIds, toMemberRef } from '../services/users';
import type { Viewer } from '../types';

function visibleAudiences(viewer: Viewer): AnnouncementAudience[] {
  return viewer.hasAccess && isStaff(viewer.role) ? ['all', 'staff'] : ['all'];
}

function canDelete(row: AnnouncementRow, viewer: Viewer): boolean {
  if (!viewer.hasAccess) return false;
  return row.authorId === viewer.id || can(viewer.role, 'announcements:manage-any');
}

export const announcementRoutes: FastifyPluginAsyncZod = async (app) => {
  function toDto(row: AnnouncementRow, author: Parameters<typeof toMemberRef>[0], viewer: Viewer): Announcement {
    return {
      id: row.id,
      body: row.body,
      audience: row.audience,
      author: toMemberRef(author),
      canDelete: canDelete(row, viewer),
      createdAt: row.createdAt.toISOString(),
    };
  }

  app.get(
    '/announcements',
    {
      schema: {
        tags: ['announcements'],
        summary: 'Latest announcements',
        querystring: listQuerySchema,
        response: { 200: announcementListSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const rows = await app.db
        .select({ announcement: announcements, author: { id: users.id, fullName: users.fullName, role: users.role } })
        .from(announcements)
        .leftJoin(users, eq(announcements.authorId, users.id))
        .where(inArray(announcements.audience, visibleAudiences(viewer)))
        .orderBy(desc(announcements.createdAt))
        .limit(request.query.limit);
      return { items: rows.map((row) => toDto(row.announcement, row.author, viewer)) };
    },
  );

  app.post(
    '/announcements',
    {
      preHandler: requirePermission('announcements:create'),
      schema: {
        tags: ['announcements'],
        summary: 'Post an announcement (staff)',
        body: announcementCreateSchema,
        response: { 201: announcementSchema },
      },
    },
    async (request, reply) => {
      const { viewer } = request;
      const [row] = await app.db
        .insert(announcements)
        .values({ authorId: viewer.id, body: request.body.body, audience: request.body.audience })
        .returning();

      const recipients = await audienceIds(
        app.db,
        viewer.settings,
        viewer.today,
        (member) => row!.audience === 'all' || (member.hasAccess && isStaff(member.role)),
        viewer.id,
      );
      const excerpt = row!.body.length > 140 ? `${row!.body.slice(0, 137)}…` : row!.body;
      await notify(app.db, recipients, {
        kind: 'announcement',
        title: `Announcement from ${viewer.role === 'organizer' ? 'the organizers' : ROLE_LABELS[viewer.role]}`,
        body: excerpt,
        link: '/home',
      });

      reply.code(201);
      return toDto(row!, viewer.user, viewer);
    },
  );

  app.delete(
    '/announcements/:id',
    {
      schema: {
        tags: ['announcements'],
        summary: 'Delete an announcement (author or admin)',
        params: idParamsSchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const [row] = await app.db.select().from(announcements).where(eq(announcements.id, request.params.id)).limit(1);
      if (!row || !visibleAudiences(viewer).includes(row.audience)) throw notFound('Announcement');
      if (!canDelete(row, viewer)) throw forbidden();
      await app.db.delete(announcements).where(eq(announcements.id, row.id));
      return { ok: true as const };
    },
  );
};
