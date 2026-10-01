import {
  DEFAULT_LANGUAGE,
  translate,
  type Language,
  type Notification,
  type TranslationParams,
} from '@identity/shared';
import { inArray } from 'drizzle-orm';
import type { DbOrTx } from '../db/client';
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
 * In-app notifications (the bell), written in each recipient's language: `build`
 * is called once per language. Web push / native push can later be sent from
 * here as well.
 */
export async function notify(
  db: DbOrTx,
  userIds: readonly string[],
  build: (tr: Translate, lang: Language) => NotificationInput,
): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;

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
  await db.insert(notifications).values(
    recipients.map((recipient) => {
      const input = inputFor(recipient.language ?? DEFAULT_LANGUAGE);
      return {
        userId: recipient.id,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      };
    }),
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
