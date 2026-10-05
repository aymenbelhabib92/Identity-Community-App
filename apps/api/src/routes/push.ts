import {
  okResponseSchema,
  pushKeySchema,
  pushSubscriptionBodySchema,
  pushTestResultSchema,
  pushUnsubscribeBodySchema,
  translate,
} from '@identity/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { pushSubscriptions } from '../db/schema';
import { fieldError } from '../errors';

/**
 * Push services of the browsers (Chrome / Android, Safari / iPhone, Firefox,
 * Edge). The server sends requests to subscription endpoints, so only these
 * hosts are accepted — never an address inside the server's network.
 */
const PUSH_SERVICE_HOSTS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'notify.windows.com', 'push.apple.com'];

function isPushService(endpoint: string): boolean {
  const host = new URL(endpoint).hostname;
  return PUSH_SERVICE_HOSTS.some((service) => host === service || host.endsWith(`.${service}`));
}

/** Web Push: devices register here to receive the club's notifications. */
export const pushRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/push/key',
    { schema: { tags: ['push'], summary: 'Public key for subscribing to push notifications', response: { 200: pushKeySchema } } },
    async () => ({ publicKey: app.push.publicKey }),
  );

  app.put(
    '/push/subscription',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        tags: ['push'],
        summary: 'Receive push notifications on this device',
        description: 'Body: the PushSubscription of the browser. A device already registered by another account moves to this one.',
        body: pushSubscriptionBodySchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      const { endpoint, keys } = request.body;
      if (!isPushService(endpoint)) throw fieldError('endpoint', 'Unknown push service.');
      const values = { userId: request.viewer.id, p256dh: keys.p256dh, auth: keys.auth };
      await app.db
        .insert(pushSubscriptions)
        .values({ endpoint, ...values })
        .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: values });
      return { ok: true as const };
    },
  );

  app.delete(
    '/push/subscription',
    {
      schema: {
        tags: ['push'],
        summary: 'Stop push notifications on this device',
        body: pushUnsubscribeBodySchema,
        response: { 200: okResponseSchema },
      },
    },
    async (request) => {
      await app.db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.endpoint, request.body.endpoint), eq(pushSubscriptions.userId, request.viewer.id)));
      return { ok: true as const };
    },
  );

  app.post(
    '/push/test',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        tags: ['push'],
        summary: 'Send a test notification to my devices',
        response: { 200: pushTestResultSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const devices = await app.push.sendNow(viewer.id, {
        kind: 'test',
        title: translate(viewer.lang, 'Notifications are on'),
        body: translate(viewer.lang, 'You will be told here about meetups, payments and club news.'),
        link: '/notifications',
      });
      return { devices };
    },
  );
};
