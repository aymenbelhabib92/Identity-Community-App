import {
  DEFAULT_LANGUAGE,
  translate,
  type Language,
  type Notification,
  type TranslationParams,
} from '@identity/shared';
import { inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { notifications, users } from '../db/schema';

export interface NotificationInput {
  kind: 'membership' | 'payment' | 'payment_review' | 'meetup' | 'announcement' | 'role';
  title: string;
  body?: string | null;
  /** In-app path opened when the notification is tapped. */
  link?: string | null;
}

/** Translates into the recipient's language. */
export type Translate = (text: string, params?: TranslationParams) => string;

/**
 * Notifies members: in-app (the bell) and as a push notification on the
 * devices where they turned them on. Each recipient gets it in their own
 * language: `build` is called once per language.
 */
export async function notify(
  app: Pick<FastifyInstance, 'db' | 'push'>,
  userIds: readonly string[],
  build: (tr: Translate, lang: Language) => NotificationInput,
): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;

  const { db } = app;
  const recipients = await db.select({ id: users.id, language: users.language }).from(users).where(inArray(users.id, unique));
  const inputs = new Map<Language, NotificationInput>();
  const inputFor = (lang: Language) => {
    let input = inputs.get(lang);
    if (!input) {
      input = build((text, params) => translate(lang, text, params), lang);
      inputs.set(lang, input);
    }
    return input;
  };

  if (recipients.length === 0) return;
  const rows = recipients.map((recipient) => {
    const input = inputFor(recipient.language ?? DEFAULT_LANGUAGE);
    return { userId: recipient.id, kind: input.kind, title: input.title, body: input.body ?? null, link: input.link ?? null };
  });
  await db.insert(notifications).values(rows);
  app.push.queue(
    rows.map(({ userId, kind, title, body, link }) => ({ userId, message: { kind, title, body, link } })),
  );
}

export function toNotificationDto(row: typeof notifications.$inferSelect): Notification {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    link: row.link,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}
