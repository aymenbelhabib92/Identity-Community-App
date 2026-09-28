import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authenticate } from '../plugins/auth';
import { adminRoutes } from './admin';
import { announcementRoutes } from './announcements';
import { authRoutes } from './auth';
import { geoRoutes } from './geo';
import { mapRoutes } from './map';
import { meRoutes } from './me';
import { meetupRoutes } from './meetups';
import { membershipRoutes } from './membership';
import { notificationRoutes } from './notifications';
import { passRoutes } from './pass';

/** Version 1 of the API, mounted at /api/v1 and shared by the web app and the native app. */
export const apiRoutes: FastifyPluginAsyncZod = async (app) => {
  await app.register(authRoutes);

  await app.register(async (secured) => {
    secured.addHook('onRequest', authenticate);
    await secured.register(meRoutes);
    await secured.register(membershipRoutes);
    await secured.register(meetupRoutes);
    await secured.register(announcementRoutes);
    await secured.register(notificationRoutes);
    await secured.register(mapRoutes);
    await secured.register(geoRoutes);
    await secured.register(passRoutes);
    await secured.register(adminRoutes, { prefix: '/admin' });
  });
};
