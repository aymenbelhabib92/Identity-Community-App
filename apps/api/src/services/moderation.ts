import { and, eq, gte, isNull, or, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { DbOrTx } from '../db/client';
import { memberBans, memberDevices, users } from '../db/schema';
import { isBanned } from './users';

// ─── Devices ─────────────────────────────────────────────────────────────────

/**
 * The installation of the app making the request (X-Device-Id): a random
 * identifier the app creates once and keeps on the device. A web app cannot read
 * a hardware identifier; clearing the app's data gives a new one.
 */
export function deviceIdOf(request: FastifyRequest): string | null {
  const value = request.headers['x-device-id'];
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(value) ? value : null;
}

export async function recordDevice(db: DbOrTx, userId: string, deviceId: string | null, now: Date): Promise<void> {
  if (!deviceId) return;
  await db
    .insert(memberDevices)
    .values({ deviceId, userId, firstSeenAt: now, lastSeenAt: now })
    .onConflictDoUpdate({ target: [memberDevices.deviceId, memberDevices.userId], set: { lastSeenAt: now } });
}

/**
 * A device used by a member banned for life signs in to no account and registers
 * none; while any of its members' bans runs, it registers no new account either.
 */
export async function deviceBlocked(db: DbOrTx, deviceId: string | null, now: Date, purpose: 'sign-in' | 'register') {
  if (!deviceId) return false;
  const owners = await db
    .select({ bannedUntil: users.bannedUntil, bannedForever: users.bannedForever })
    .from(memberDevices)
    .innerJoin(users, eq(memberDevices.userId, users.id))
    .where(eq(memberDevices.deviceId, deviceId));
  return owners.some((owner) => owner.bannedForever || (purpose === 'register' && isBanned(owner, now)));
}

export async function deviceCounts(db: DbOrTx, userId?: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ userId: memberDevices.userId, count: sql<number>`count(*)::int` })
    .from(memberDevices)
    .where(userId ? eq(memberDevices.userId, userId) : undefined)
    .groupBy(memberDevices.userId);
  return new Map(rows.map((row) => [row.userId, Number(row.count)]));
}

// ─── Bans ────────────────────────────────────────────────────────────────────

/** Bans that count in the tiers: not for life, and not lifted before their end. */
const countedBan = and(
  eq(memberBans.permanent, false),
  or(isNull(memberBans.liftedAt), gte(memberBans.liftedAt, memberBans.endsAt)),
);

export async function banCounts(db: DbOrTx, userId?: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ userId: memberBans.userId, count: sql<number>`count(*)::int` })
    .from(memberBans)
    .where(userId ? and(countedBan, eq(memberBans.userId, userId)) : countedBan)
    .groupBy(memberBans.userId);
  return new Map(rows.map((row) => [row.userId, Number(row.count)]));
}
