import {
  approximateLocation,
  authResponseSchema,
  changePasswordBodySchema,
  clubSettingsSchema,
  locationSharingBodySchema,
  locationUpdateSchema,
  myLocationSchema,
  normalizeInstagram,
  okResponseSchema,
  updateMeBodySchema,
  userSchema,
  type MyLocation,
} from '@identity/shared';
import { eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Db } from '../db/client';
import { memberLocations, pushSubscriptions, users } from '../db/schema';
import { AppError, conflict, fieldError } from '../errors';
import { hashPassword, verifyPassword } from '../lib/password';
import { requireAccess, signAccessToken } from '../plugins/auth';
import { findUser, toUserDto } from '../services/users';
import { loadRedZones, redZoneAt } from '../services/zones';

async function myLocation(db: Db, userId: string, sharing: boolean): Promise<MyLocation> {
  const [row] = await db.select().from(memberLocations).where(eq(memberLocations.userId, userId)).limit(1);
  // A red zone drawn around the stored position since: it is not shown (GET /map/members).
  const zone = row ? redZoneAt(await loadRedZones(db), row) : undefined;
  return {
    sharing,
    lat: row?.lat ?? null,
    lng: row?.lng ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    redZone: zone ? { id: zone.id, name: zone.name } : null,
  };
}

/** The signed-in member: profile, password, location sharing. */
export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/me',
    { schema: { tags: ['me'], summary: 'Current member', response: { 200: userSchema } } },
    async (request) => toUserDto(request.viewer.user, request.viewer),
  );

  app.patch(
    '/me',
    { schema: { tags: ['me'], summary: 'Update profile', body: updateMeBodySchema, response: { 200: userSchema } } },
    async (request) => {
      const { viewer } = request;
      const { fullName, car, bio, language, chatNotifications } = request.body;
      let instagram: string | null | undefined = request.body.instagram;
      if (instagram) {
        instagram = normalizeInstagram(instagram);
        if (!instagram) throw fieldError('instagram', 'Enter an Instagram name or the link to the profile.');
      }
      const [user] = await app.db
        .update(users)
        .set({
          ...(fullName !== undefined && { fullName }),
          ...(car !== undefined && { car: car || null }),
          ...(bio !== undefined && { bio: bio || null }),
          ...(instagram !== undefined && { instagram: instagram || null }),
          ...(language !== undefined && { language }),
          ...(chatNotifications !== undefined && { chatNotifications }),
        })
        .where(eq(users.id, viewer.id))
        .returning();
      return toUserDto(user!, viewer);
    },
  );

  app.post(
    '/me/password',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['me'],
        summary: 'Change password',
        description: 'Signs out every other device and returns a fresh token for this one.',
        body: changePasswordBodySchema,
        response: { 200: authResponseSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      if (!(await verifyPassword(request.body.currentPassword, viewer.user.passwordHash))) {
        throw fieldError('currentPassword', 'Current password is incorrect.');
      }
      const [user] = await app.db
        .update(users)
        .set({
          passwordHash: await hashPassword(request.body.newPassword),
          tokenVersion: sql`${users.tokenVersion} + 1`,
        })
        .where(eq(users.id, viewer.id))
        .returning();
      // Signed-out devices stop receiving notifications; this one registers again.
      await app.db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, viewer.id));
      return { token: signAccessToken(app, user!), user: toUserDto(user!, viewer) };
    },
  );

  app.post(
    '/auth/logout-all',
    { schema: { tags: ['auth'], summary: 'Sign out on every device', response: { 200: okResponseSchema } } },
    async (request) => {
      await app.db
        .update(users)
        .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
        .where(eq(users.id, request.viewer.id));
      await app.db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, request.viewer.id));
      return { ok: true as const };
    },
  );

  app.get(
    '/club/settings',
    { schema: { tags: ['club'], summary: 'Club settings: fees, rules, payment instructions', response: { 200: clubSettingsSchema } } },
    async (request) => request.viewer.settings,
  );

  app.get(
    '/me/location',
    { schema: { tags: ['map'], summary: 'My shared position (as other members see it)', response: { 200: myLocationSchema } } },
    async (request) => myLocation(app.db, request.viewer.id, request.viewer.user.locationSharing),
  );

  app.put(
    '/me/location-sharing',
    {
      schema: {
        tags: ['map'],
        summary: 'Turn location sharing on or off',
        description: 'Turning it off deletes the stored position immediately.',
        body: locationSharingBodySchema,
        response: { 200: myLocationSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const { enabled } = request.body;
      if (enabled && !viewer.hasAccess) {
        throw new AppError(403, 'MEMBERS_ONLY', 'Location sharing is available to active members.');
      }
      await app.db.update(users).set({ locationSharing: enabled }).where(eq(users.id, viewer.id));
      if (!enabled) await app.db.delete(memberLocations).where(eq(memberLocations.userId, viewer.id));
      return myLocation(app.db, viewer.id, enabled);
    },
  );

  app.put(
    '/me/location',
    {
      preHandler: requireAccess,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags: ['map'],
        summary: 'Update my position',
        description:
          'The position is snapped to a ~100 m grid before it is stored; the exact point is never kept. ' +
          'Inside a red zone nothing is stored and the position is hidden (`redZone`) until the member leaves it.',
        body: locationUpdateSchema,
        response: { 200: myLocationSchema },
      },
    },
    async (request) => {
      const { viewer } = request;
      const user = await findUser(app.db, viewer.id);
      if (!user?.locationSharing) throw conflict('SHARING_OFF', 'Turn on location sharing first.');

      const zone = redZoneAt(await loadRedZones(app.db), request.body);
      if (zone) {
        await app.db.delete(memberLocations).where(eq(memberLocations.userId, viewer.id));
        return { sharing: true, lat: null, lng: null, updatedAt: null, redZone: { id: zone.id, name: zone.name } };
      }

      const point = approximateLocation(request.body);
      const now = app.clock.now();
      await app.db
        .insert(memberLocations)
        .values({ userId: viewer.id, ...point, updatedAt: now })
        .onConflictDoUpdate({ target: memberLocations.userId, set: { ...point, updatedAt: now } });
      return myLocation(app.db, viewer.id, true);
    },
  );
};
