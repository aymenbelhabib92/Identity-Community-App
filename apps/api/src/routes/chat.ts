import {
  can,
  chatListQuerySchema,
  chatMemberListSchema,
  chatMessageListSchema,
  chatMessageSchema,
  chatPostBodySchema,
  chatUnreadSchema,
  idParamsSchema,
} from '@identity/shared';
import { asc, eq, gt, inArray, lt, ne } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { chatMessages, users } from '../db/schema';
import { fieldError, forbidden, notFound } from '../errors';
import { requireAccess } from '../plugins/auth';
import { loadChatMessages, pushChatMessage, unreadCount } from '../services/chat';
import { memberRefColumns, stateOf, toMemberRef } from '../services/users';

/** The club chat: one public room for members with access, kept in the database. */
export const chatRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', requireAccess);

  const loadOne = async (id: string, now: Date) =>
    (await loadChatMessages(app.db, { where: eq(chatMessages.id, id), order: 'asc', limit: 1, now }))[0];

  app.get(
    '/chat/messages',
    {
      schema: {
        tags: ['chat'],
        summary: 'Chat messages, oldest first',
        description:
          'Without parameters: the latest messages. `before`: older ones (scrolling back). ' +
          '`after`: newer ones (catching up after a lost connection).',
        querystring: chatListQuerySchema,
        response: { 200: chatMessageListSchema },
      },
    },
    async (request) => {
      const { before, after, limit } = request.query;
      const now = request.viewer.now;
      if (after) {
        const items = await loadChatMessages(app.db, {
          where: gt(chatMessages.createdAt, new Date(after)),
          order: 'asc',
          limit,
          now,
        });
        return { items, hasMore: false };
      }
      const page = await loadChatMessages(app.db, {
        where: before ? lt(chatMessages.createdAt, new Date(before)) : undefined,
        order: 'desc',
        limit: limit + 1,
        now,
      });
      return { items: page.slice(0, limit).reverse(), hasMore: page.length > limit };
    },
  );

  app.post(
    '/chat/messages',
    {
      config: {
        // Per member (their token), not per address: members at a meetup or behind
        // the same mobile network share one address.
        rateLimit: { max: 30, timeWindow: '1 minute', keyGenerator: (request) => request.headers.authorization ?? request.ip },
      },
      schema: {
        tags: ['chat'],
        summary: 'Send a message',
        description:
          '`mentions`: ids of the members written as @Name in the text (they are notified). ' +
          'The message reaches the members reading the chat at once (GET /chat/stream).',
        body: chatPostBodySchema,
        response: { 201: chatMessageSchema },
      },
    },
    async (request, reply) => {
      const { viewer } = request;
      const { body, replyToId } = request.body;

      let replyToAuthorId: string | null = null;
      if (replyToId) {
        const [target] = await app.db
          .select({ authorId: chatMessages.authorId })
          .from(chatMessages)
          .where(eq(chatMessages.id, replyToId))
          .limit(1);
        if (!target) throw fieldError('replyToId', 'This message no longer exists.');
        replyToAuthorId = target.authorId;
      }

      // Only existing members, never oneself.
      const wanted = [...new Set(request.body.mentions ?? [])].filter((id) => id !== viewer.id);
      const mentions = wanted.length
        ? (await app.db.select({ id: users.id }).from(users).where(inArray(users.id, wanted))).map((row) => row.id)
        : [];

      const [row] = await app.db
        .insert(chatMessages)
        .values({ authorId: viewer.id, body, replyToId: replyToId ?? null, mentions, createdAt: viewer.now })
        .returning({ id: chatMessages.id });
      // Writing in the chat means having read it.
      await app.db.update(users).set({ chatReadAt: viewer.now, updatedAt: viewer.user.updatedAt }).where(eq(users.id, viewer.id));

      const message = (await loadOne(row!.id, viewer.now))!;
      app.chat.send('message', message);
      app.push.track(pushChatMessage(app, message, replyToAuthorId === viewer.id ? null : replyToAuthorId));
      reply.code(201);
      return message;
    },
  );

  app.delete(
    '/chat/messages/:id',
    {
      schema: {
        tags: ['chat'],
        summary: 'Delete a message (its author, or an admin)',
        description: 'The message stays in the conversation as "deleted", without its text.',
        params: idParamsSchema,
        response: { 200: chatMessageSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const [row] = await app.db.select().from(chatMessages).where(eq(chatMessages.id, request.params.id)).limit(1);
      if (!row) throw notFound('Message');
      if (row.authorId !== viewer.id && !can(viewer.role, 'chat:moderate')) throw forbidden();
      if (!row.deletedAt) {
        await app.db.update(chatMessages).set({ deletedAt: viewer.now }).where(eq(chatMessages.id, row.id));
        app.chat.send('deleted', { id: row.id });
      }
      return (await loadOne(row.id, viewer.now))!;
    },
  );

  app.post(
    '/chat/read',
    { schema: { tags: ['chat'], summary: 'Mark the chat as read', response: { 200: chatUnreadSchema } } },
    async (request) => {
      const { viewer } = request;
      await app.db.update(users).set({ chatReadAt: viewer.now, updatedAt: viewer.user.updatedAt }).where(eq(users.id, viewer.id));
      return { unread: 0 };
    },
  );

  app.get(
    '/chat/unread',
    { schema: { tags: ['chat'], summary: 'Number of unread messages (Chat tab badge)', response: { 200: chatUnreadSchema } } },
    async (request) => ({ unread: await unreadCount(app.db, request.viewer.user) }),
  );

  app.get(
    '/chat/members',
    { schema: { tags: ['chat'], summary: 'Members who can be mentioned', response: { 200: chatMemberListSchema } } },
    async (request) => {
      const { viewer } = request;
      const rows = await app.db
        .select({ ref: memberRefColumns(users), status: users.status, paidUntil: users.paidUntil })
        .from(users)
        .where(ne(users.status, 'rejected'))
        .orderBy(asc(users.fullName));
      return {
        items: rows
          .filter((row) => stateOf({ ...row, role: row.ref.role }, viewer.settings, viewer.today).hasAccess)
          .map((row) => toMemberRef(row.ref, viewer.now)!),
      };
    },
  );

  app.get(
    '/chat/stream',
    {
      schema: {
        tags: ['chat'],
        summary: 'Live messages (Server-Sent Events)',
        description:
          'text/event-stream with `message` events (a new message, as in GET /chat/messages) and `deleted` events ({ id }). ' +
          'While a member keeps it open, they get no push notification for the chat.',
      },
    },
    async (request, reply) => {
      reply.hijack();
      const stream = reply.raw;
      stream.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        // no-transform: proxies must not buffer or compress the stream.
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      stream.write('retry: 3000\n\n');
      app.chat.open(request.viewer.id, stream);
      // The response stays open until the member leaves (or the server stops).
      stream.on('close', () => app.chat.close(stream));
    },
  );
};
