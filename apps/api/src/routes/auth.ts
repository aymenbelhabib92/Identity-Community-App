import {
  authResponseSchema,
  clubInfoSchema,
  formatPhone,
  loginBodySchema,
  normalizePhone,
  pickLanguage,
  registerBodySchema,
} from '@identity/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { users } from '../db/schema';
import { AppError, fieldError, isUniqueViolation } from '../errors';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../lib/password';
import { buildViewer, signAccessToken } from '../plugins/auth';
import { notify } from '../services/notifications';
import { staffWith, toUserDto } from '../services/users';

const authRateLimit = { max: 10, timeWindow: '1 minute' };

const phoneTaken = () =>
  new AppError(409, 'PHONE_TAKEN', 'An account already exists with this phone number.', [
    { path: ['phone'], message: 'Already registered. Sign in instead.' },
  ]);

/** Public routes: sign up, sign in, and what the join screen displays. */
export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/auth/register',
    {
      config: { rateLimit: authRateLimit },
      schema: {
        tags: ['auth'],
        summary: 'Request a membership',
        description: 'Creates a pending account. It becomes active once the entry fee is verified.',
        security: [],
        body: registerBodySchema,
        response: { 201: authResponseSchema },
      },
    },
    async (request, reply) => {
      const { fullName, password, car } = request.body;
      const phone = normalizePhone(request.body.phone);
      if (!phone) throw fieldError('phone', 'Enter a valid phone number.');

      const [existing] = await app.db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
      if (existing) throw phoneTaken();

      let user;
      try {
        [user] = await app.db
          .insert(users)
          .values({
            fullName,
            phone,
            car: car || null,
            passwordHash: await hashPassword(password),
            // The language of the app the member signed up with.
            language: pickLanguage(request.headers['accept-language']),
            lastSeenAt: app.clock.now(),
          })
          .returning();
      } catch (err) {
        if (isUniqueViolation(err)) throw phoneTaken();
        throw err;
      }
      if (!user) throw new Error('Insert returned no row');
      const member = user;

      await notify(app.db, await staffWith(app.db, 'payments:review'), (tr) => ({
        kind: 'membership',
        title: tr('New membership request'),
        body: `${member.fullName} · ${formatPhone(member.phone)}`,
        link: `/admin/members/${member.id}`,
      }));

      const viewer = await buildViewer(app, user, request.lang);
      reply.code(201);
      return { token: signAccessToken(app, user), user: toUserDto(user, viewer) };
    },
  );

  app.post(
    '/auth/login',
    {
      config: { rateLimit: authRateLimit },
      schema: {
        tags: ['auth'],
        summary: 'Sign in with phone number and password',
        security: [],
        body: loginBodySchema,
        response: { 200: authResponseSchema },
      },
    },
    async (request) => {
      const invalid = new AppError(401, 'INVALID_CREDENTIALS', 'Wrong phone number or password.');
      const phone = normalizePhone(request.body.phone);
      const [user] = phone ? await app.db.select().from(users).where(eq(users.phone, phone)).limit(1) : [];
      if (!user) {
        await burnPasswordCheck(request.body.password);
        throw invalid;
      }
      if (!(await verifyPassword(request.body.password, user.passwordHash))) throw invalid;

      const now = app.clock.now();
      await app.db.update(users).set({ lastSeenAt: now, updatedAt: user.updatedAt }).where(eq(users.id, user.id));
      const viewer = await buildViewer(app, { ...user, lastSeenAt: now }, request.lang);
      return { token: signAccessToken(app, user), user: toUserDto(viewer.user, viewer) };
    },
  );

  app.get(
    '/club/info',
    {
      schema: {
        tags: ['club'],
        summary: 'Fees shown on the join screen',
        security: [],
        response: { 200: clubInfoSchema },
      },
    },
    async () => {
      const { currency, entryFee, duesAmount, duesPeriodMonths } = await app.clubSettings.get();
      return { currency, entryFee, duesAmount, duesPeriodMonths };
    },
  );
};
