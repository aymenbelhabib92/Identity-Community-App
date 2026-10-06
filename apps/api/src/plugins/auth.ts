import { can, DEFAULT_LANGUAGE, todayIn, type Language, type Permission } from '@identity/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { users, type UserRow } from '../db/schema';
import { AppError, forbidden, unauthorized } from '../errors';
import { deviceIdOf, recordDevice } from '../services/moderation';
import { stateOf } from '../services/users';
import type { AccessTokenPayload, PassTokenPayload, Viewer } from '../types';

/** How often a member's "last seen" time is written. */
const LAST_SEEN_STEP_MS = 60_000;

export function signAccessToken(app: FastifyInstance, user: Pick<UserRow, 'id' | 'tokenVersion'>): string {
  const payload: AccessTokenPayload = { sub: user.id, tv: user.tokenVersion, typ: 'access' };
  return app.jwt.sign(payload, { expiresIn: app.config.tokenTtl });
}

export async function buildViewer(app: FastifyInstance, user: UserRow, lang: Language = DEFAULT_LANGUAGE): Promise<Viewer> {
  const settings = await app.clubSettings.get();
  const now = app.clock.now();
  const today = todayIn(app.config.timezone, now);
  return { id: user.id, user, role: user.role, ...stateOf(user, settings, today, now), settings, today, now, lang };
}

/** onRequest hook: resolves the bearer token to `request.viewer`. */
export async function authenticate(request: FastifyRequest): Promise<void> {
  const app = request.server;
  let payload: AccessTokenPayload | PassTokenPayload;
  try {
    payload = await request.jwtVerify<AccessTokenPayload | PassTokenPayload>();
  } catch {
    throw unauthorized();
  }
  if (payload.typ !== 'access') throw unauthorized();

  const [user] = await app.db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!user || user.tokenVersion !== payload.tv || user.bannedForever) {
    throw unauthorized('Your session has ended. Please sign in again.');
  }

  // Presence: other members see who used the app in the last few minutes. The
  // device is noted at the same pace (see services/moderation.ts).
  const now = app.clock.now();
  if (!user.lastSeenAt || now.getTime() - user.lastSeenAt.getTime() >= LAST_SEEN_STEP_MS) {
    await app.db.update(users).set({ lastSeenAt: now, updatedAt: user.updatedAt }).where(eq(users.id, user.id));
    await recordDevice(app.db, user.id, deviceIdOf(request), now);
    user.lastSeenAt = now;
  }
  request.viewer = await buildViewer(app, user, request.lang);
}

/** Map, secret meetups and other member-only features. */
export async function requireAccess(request: FastifyRequest): Promise<void> {
  if (!request.viewer.hasAccess) {
    throw new AppError(403, 'MEMBERS_ONLY', 'Available to active members once your membership is confirmed.');
  }
}

export function requirePermission(permission: Permission) {
  return async (request: FastifyRequest): Promise<void> => {
    const { viewer } = request;
    if (!viewer.hasAccess || !can(viewer.role, permission)) throw forbidden();
  };
}
