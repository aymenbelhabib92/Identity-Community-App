import { notificationListSchema, okResponseSchema } from '@identity/shared';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { notifications } from '../db/schema';
import { toNotificationDto } from '../services/notifications';

export const notificationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/notifications',
    {
      schema: {
        tags: ['notifications'],
        summary: 'My latest notifications and unread count',
        response: { 200: notificationListSchema },
      },
    },
    async (request) => {
      const userId = request.viewer.id;
      const [rows, [unread]] = await Promise.all([
        app.db
          .select()
          .from(notifications)
          .where(eq(notifications.userId, userId))
          .orderBy(desc(notifications.createdAt))
          .limit(50),
        app.db
          .select({ count: sql<number>`count(*)::int` })
          .from(notifications)
          .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
      ]);
      return { items: rows.map(toNotificationDto), unread: Number(unread?.count ?? 0) };
    },
  );

  app.post(
    '/notifications/read-all',
    { schema: { tags: ['notifications'], summary: 'Mark everything as read', response: { 200: okResponseSchema } } },
    async (request) => {
      await app.db
        .update(notifications)
        .set({ readAt: app.clock.now() })
        .where(and(eq(notifications.userId, request.viewer.id), isNull(notifications.readAt)));
      return { ok: true as const };
    },
  );
};
