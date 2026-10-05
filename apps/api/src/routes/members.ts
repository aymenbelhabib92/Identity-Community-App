import { idParamsSchema, memberProfileSchema } from '@identity/shared';
import { and, eq, ne } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { users } from '../db/schema';
import { notFound } from '../errors';
import { requireAccess } from '../plugins/auth';
import { memberRefColumns, toMemberRef } from '../services/users';

/** Members as they see each other (the profile opened from the chat). */
export const memberRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/members/:id',
    {
      preHandler: requireAccess,
      schema: {
        tags: ['members'],
        summary: "A member's profile",
        description: 'Name, role, photo, car and car photos. Never the phone number or the membership state.',
        params: idParamsSchema,
        response: { 200: memberProfileSchema },
      },
    },
    async (request) => {
      const [row] = await app.db
        .select({ member: memberRefColumns(users), car: users.car, carPhotoIds: users.carPhotoIds, approvedAt: users.approvedAt })
        .from(users)
        .where(and(eq(users.id, request.params.id), ne(users.status, 'rejected')))
        .limit(1);
      if (!row) throw notFound('Member');
      return {
        ...toMemberRef(row.member, request.viewer.now)!,
        car: row.car,
        carPhotos: row.carPhotoIds,
        memberSince: row.approvedAt?.toISOString() ?? null,
      };
    },
  );
};
