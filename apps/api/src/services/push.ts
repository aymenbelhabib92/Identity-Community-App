import { eq, inArray } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import webpush from 'web-push';
import type { Config } from '../config';
import type { Db } from '../db/client';
import { pushSubscriptions, settings } from '../db/schema';

/** What the service worker shows (see apps/web/public/push-sw.js). */
export interface PushMessage {
  title: string;
  body: string | null;
  /** In-app path opened when the notification is tapped. */
  link: string | null;
  kind: string;
  /** Notifications with the same tag replace each other on the phone (grouped chat messages). */
  tag?: string;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Sends one message to one browser. Rejects with an error carrying
 * `statusCode` 404 or 410 when the subscription no longer exists.
 */
export type PushTransport = (target: PushTarget, payload: string) => Promise<void>;

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const VAPID_SETTING = 'vapid';

/** VAPID keys from the environment, otherwise generated once and kept in the database. */
export async function loadVapidKeys(db: Db, config: Pick<Config, 'vapid'>): Promise<VapidKeys> {
  const { publicKey, privateKey, subject } = config.vapid;
  if (publicKey && privateKey) return { publicKey, privateKey, subject };

  const read = async () => {
    const [row] = await db.select().from(settings).where(eq(settings.key, VAPID_SETTING)).limit(1);
    return row?.value as { publicKey: string; privateKey: string } | undefined;
  };
  let stored = await read();
  if (!stored?.publicKey) {
    await db.insert(settings).values({ key: VAPID_SETTING, value: webpush.generateVAPIDKeys() }).onConflictDoNothing();
    stored = (await read())!;
  }
  return { publicKey: stored.publicKey, privateKey: stored.privateKey, subject };
}

export function webPushTransport(keys: VapidKeys): PushTransport {
  return async (target, payload) => {
    await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, payload, {
      vapidDetails: keys,
      // Delivered when the phone comes back online within a day, then dropped.
      TTL: 24 * 3600,
      // Every message is shown to the member: the push services deliver it at once,
      // even to a phone asleep. With "normal", Android and iOS hold it until the
      // phone wakes the browser up (in practice: until the app is opened).
      urgency: 'high',
    });
  };
}

/**
 * Web Push delivery. `queue` returns at once: messages are sent in the
 * background so API responses never wait for the push services. Subscriptions
 * the push service reports as gone are deleted.
 */
export class PushService {
  readonly publicKey: string;
  private readonly db: Db;
  private readonly transport: PushTransport;
  private readonly log: FastifyBaseLogger;
  private readonly pending = new Set<Promise<void>>();

  constructor(options: { db: Db; publicKey: string; transport: PushTransport; log: FastifyBaseLogger }) {
    this.db = options.db;
    this.publicKey = options.publicKey;
    this.transport = options.transport;
    this.log = options.log;
  }

  queue(messages: readonly { userId: string; message: PushMessage }[]): void {
    if (messages.length === 0) return;
    this.track(this.deliver(messages));
  }

  /** Runs `task` in the background (preparing messages, then queueing them); `flush` waits for it. */
  track(task: Promise<void>): void {
    const tracked = task.catch((err: unknown) => this.log.error({ err }, 'push delivery failed'));
    this.pending.add(tracked);
    void tracked.finally(() => this.pending.delete(tracked));
  }

  /** Waits for the messages queued so far, including those queued by tracked tasks (tests, shutdown). */
  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  /** Sends now to every device of `userId`; resolves with the number of devices reached. */
  async sendNow(userId: string, message: PushMessage): Promise<number> {
    const targets = await this.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    const results = await Promise.all(targets.map((target) => this.sendOne(target, message)));
    return results.filter(Boolean).length;
  }

  private async deliver(messages: readonly { userId: string; message: PushMessage }[]): Promise<void> {
    const userIds = [...new Set(messages.map((m) => m.userId))];
    const targets = await this.db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds));
    const byUser = new Map<string, PushTarget[]>();
    for (const target of targets) byUser.set(target.userId, [...(byUser.get(target.userId) ?? []), target]);
    await Promise.all(
      messages.flatMap(({ userId, message }) => (byUser.get(userId) ?? []).map((target) => this.sendOne(target, message))),
    );
  }

  private async sendOne(target: PushTarget, message: PushMessage): Promise<boolean> {
    try {
      await this.transport(target, JSON.stringify(message));
      return true;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, target.endpoint));
      } else {
        this.log.warn({ status, service: new URL(target.endpoint).host }, 'push not delivered');
      }
      return false;
    }
  }
}
