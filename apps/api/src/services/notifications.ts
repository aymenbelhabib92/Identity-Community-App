import type { Notification } from '@identity/shared';
import type { DbOrTx } from '../db/client';
import { notifications } from '../db/schema';

export interface NotificationInput {
  kind: 'membership' | 'payment' | 'payment_review' | 'meetup' | 'announcement' | 'role';
  title: string;
  body?: string | null;
  /** In-app path opened when the notification is tapped. */
  link?: string | null;
}

/**
 * In-app notifications (the bell). Web push / native push can later be sent
 * from here as well.
 */
export async function notify(db: DbOrTx, userIds: readonly string[], input: NotificationInput): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  await db.insert(notifications).values(
    unique.map((userId) => ({
      userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    })),
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
