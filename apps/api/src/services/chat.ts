import type { ServerResponse } from 'node:http';
import {
  CHAT_PUSH_INTERVAL_MINUTES,
  shortName,
  todayIn,
  translate,
  translatePlural,
  type ChatMessage,
  type Language,
} from '@identity/shared';
import { and, asc, desc, eq, gt, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { FastifyInstance } from 'fastify';
import type { DbOrTx } from '../db/client';
import { chatMessages, users } from '../db/schema';
import type { PushMessage } from './push';
import { memberRefColumns, stateOf, toMemberRef } from './users';

const replies = alias(chatMessages, 'reply');
const replyAuthors = alias(users, 'reply_author');

/** "The start of a long message…" */
export function excerpt(text: string, length = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1).trimEnd()}…` : flat;
}

/** Messages with their author and the message they reply to. */
export async function loadChatMessages(
  db: DbOrTx,
  options: { where?: SQL; order: 'asc' | 'desc'; limit: number; now: Date },
): Promise<ChatMessage[]> {
  const rows = await db
    .select({
      message: chatMessages,
      author: memberRefColumns(users),
      reply: { id: replies.id, body: replies.body, deletedAt: replies.deletedAt },
      replyAuthor: { fullName: replyAuthors.fullName },
    })
    .from(chatMessages)
    .innerJoin(users, eq(chatMessages.authorId, users.id))
    .leftJoin(replies, eq(chatMessages.replyToId, replies.id))
    .leftJoin(replyAuthors, eq(replies.authorId, replyAuthors.id))
    .where(options.where)
    .orderBy(options.order === 'asc' ? asc(chatMessages.createdAt) : desc(chatMessages.createdAt))
    .limit(options.limit);

  return rows.map(({ message, author, reply, replyAuthor }) => {
    const deleted = message.deletedAt !== null;
    return {
      id: message.id,
      author: toMemberRef(author, options.now)!,
      body: deleted ? '' : message.body,
      mentions: deleted ? [] : message.mentions,
      replyTo: reply?.id
        ? { id: reply.id, authorName: replyAuthor?.fullName ?? '', excerpt: reply.deletedAt ? '' : excerpt(reply.body) }
        : null,
      deleted,
      createdAt: message.createdAt.toISOString(),
    };
  });
}

/** Unread messages: written by others since the member last read the chat (or joined). */
export async function unreadCount(db: DbOrTx, user: { id: string; chatReadAt: Date | null; createdAt: Date }): Promise<number> {
  const since = user.chatReadAt ?? user.createdAt;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatMessages)
    .where(and(gt(chatMessages.createdAt, since), ne(chatMessages.authorId, user.id), isNull(chatMessages.deletedAt)));
  return Number(row?.count ?? 0);
}

/**
 * Members currently reading the chat, each through a Server-Sent Events stream:
 * new and deleted messages are written to every stream as they happen. Members
 * reading the chat get no push notification for it.
 */
export class ChatHub {
  private readonly streams = new Map<ServerResponse, string>();
  private readonly heartbeat: NodeJS.Timeout;

  constructor() {
    // Keeps idle connections open through proxies.
    this.heartbeat = setInterval(() => this.write(': ping\n\n'), 25_000);
    this.heartbeat.unref();
  }

  open(userId: string, stream: ServerResponse): void {
    this.streams.set(stream, userId);
  }

  close(stream: ServerResponse): void {
    this.streams.delete(stream);
  }

  /** Ends the streams of a member who lost access (banned). */
  closeUser(userId: string): void {
    for (const [stream, id] of this.streams) {
      if (id !== userId) continue;
      this.streams.delete(stream);
      stream.end();
    }
  }

  isWatching(userId: string): boolean {
    for (const id of this.streams.values()) if (id === userId) return true;
    return false;
  }

  send(event: 'message' | 'deleted' | 'read', data: unknown): void {
    this.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  shutdown(): void {
    clearInterval(this.heartbeat);
    for (const stream of this.streams.keys()) stream.end();
    this.streams.clear();
  }

  private write(chunk: string): void {
    for (const stream of this.streams.keys()) stream.write(chunk);
  }
}

/**
 * Push notifications for a new chat message, following each member's choice
 * (CHAT_NOTIFICATION_MODES): mentions and replies always reach those who did not
 * turn the chat off; "all" also gets one grouped notification at most every
 * CHAT_PUSH_INTERVAL_MINUTES. Chat messages never go to the bell.
 */
export async function pushChatMessage(
  app: Pick<FastifyInstance, 'db' | 'push' | 'chat' | 'clubSettings' | 'clock' | 'config'>,
  message: ChatMessage,
  replyToAuthorId: string | null,
): Promise<void> {
  const { db } = app;
  const now = app.clock.now();
  const settings = await app.clubSettings.get();
  const today = todayIn(app.config.timezone, now);
  const candidates = await db
    .select()
    .from(users)
    .where(and(ne(users.id, message.author.id), ne(users.chatNotifications, 'off')));

  const author = shortName(message.author.fullName);
  const text = excerpt(message.body);
  const intervalMs = CHAT_PUSH_INTERVAL_MINUTES * 60_000;
  const out: { userId: string; message: PushMessage }[] = [];

  for (const user of candidates) {
    if (!stateOf(user, settings, today, now).hasAccess || app.chat.isWatching(user.id)) continue;
    const lang: Language = user.language ?? 'en';
    const tr = (key: string, params?: Record<string, string | number>) => translate(lang, key, params);
    const mentioned = message.mentions.includes(user.id);
    const repliedTo = replyToAuthorId === user.id;

    if (mentioned || repliedTo) {
      out.push({
        userId: user.id,
        message: {
          kind: 'chat',
          title: tr(repliedTo ? '{name} replied to you' : '{name} mentioned you', { name: author }),
          body: text,
          link: '/chat',
        },
      });
    } else if (user.chatNotifications === 'all' && (!user.chatPushedAt || now.getTime() - user.chatPushedAt.getTime() >= intervalMs)) {
      const count = await unreadCount(db, user);
      out.push({
        userId: user.id,
        message: {
          kind: 'chat',
          title: tr('Club chat'),
          body: `${translatePlural(lang, count, '{count} new message', '{count} new messages')} · ${tr('{name}: {text}', { name: author, text })}`,
          link: '/chat',
          tag: 'chat',
        },
      });
      await db.update(users).set({ chatPushedAt: now, updatedAt: user.updatedAt }).where(eq(users.id, user.id));
    }
  }
  app.push.queue(out);
}
