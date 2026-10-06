import {
  can,
  hasMemberAccess,
  membershipState,
  ONLINE_WINDOW_MINUTES,
  PERMISSIONS,
  type ClubSettings,
  type IsoDate,
  type MemberRef,
  type MembershipState,
  type Permission,
  type Role,
  type User,
} from '@identity/shared';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '../db/client';
import { users, type UserRow } from '../db/schema';
import type { Viewer } from '../types';

const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** What the membership state is computed from (see `stateColumns` to select them). */
export type StateFields = Pick<UserRow, 'status' | 'paidUntil' | 'role' | 'bannedUntil' | 'bannedForever'>;

export const stateColumns = {
  status: users.status,
  paidUntil: users.paidUntil,
  role: users.role,
  bannedUntil: users.bannedUntil,
  bannedForever: users.bannedForever,
};

/** A ban is running: for life, or until a time still to come (it ends by itself). */
export function isBanned(user: Pick<UserRow, 'bannedUntil' | 'bannedForever'>, now: Date): boolean {
  return user.bannedForever || (user.bannedUntil !== null && user.bannedUntil > now);
}

export function stateOf(
  user: StateFields,
  settings: ClubSettings,
  today: IsoDate,
  now: Date,
): { state: MembershipState; hasAccess: boolean } {
  const state = membershipState({
    status: user.status,
    paidUntil: user.paidUntil,
    today,
    graceDays: settings.graceDays,
    banned: isBanned(user, now),
  });
  return { state, hasAccess: hasMemberAccess(state, user.role) };
}

/** Used the app within the last few minutes. */
export function isOnline(lastSeenAt: Date | null, now: Date): boolean {
  return lastSeenAt !== null && now.getTime() - lastSeenAt.getTime() < ONLINE_WINDOW_MINUTES * 60_000;
}

export function toUserDto(user: UserRow, { settings, today, now }: Pick<Viewer, 'settings' | 'today' | 'now'>): User {
  const { state, hasAccess } = stateOf(user, settings, today, now);
  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    car: user.car,
    avatar: user.avatarPhotoId,
    cover: user.coverPhotoId,
    carPhotos: user.carPhotoIds,
    bio: user.bio,
    instagram: user.instagram,
    language: user.language,
    online: isOnline(user.lastSeenAt, now),
    chatNotifications: user.chatNotifications,
    ban: isBanned(user, now)
      ? { until: user.bannedForever ? null : user.bannedUntil!.toISOString(), reason: user.banReason }
      : null,
    role: user.role,
    status: user.status,
    state,
    hasAccess,
    badgeNumber: user.badgeNumber,
    paidUntil: user.paidUntil,
    approvedAt: user.approvedAt?.toISOString() ?? null,
    locationSharing: user.locationSharing,
    permissions: ALL_PERMISSIONS.filter((permission) => can(user.role, permission)),
    createdAt: user.createdAt.toISOString(),
  };
}

export type MemberRefRow = Pick<UserRow, 'id' | 'fullName' | 'role' | 'avatarPhotoId' | 'lastSeenAt'>;

/** Columns to select for `toMemberRef`, from `users` or an alias of it. */
export function memberRefColumns<T extends Record<keyof MemberRefRow, AnyPgColumn>>(table: T): Pick<T, keyof MemberRefRow> {
  const { id, fullName, role, avatarPhotoId, lastSeenAt } = table;
  return { id, fullName, role, avatarPhotoId, lastSeenAt };
}

export function toMemberRef(user: MemberRefRow | null | undefined, now: Date): MemberRef | null {
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.fullName,
    role: user.role,
    avatar: user.avatarPhotoId,
    online: isOnline(user.lastSeenAt, now),
  };
}

export async function findUser(db: DbOrTx, id: string): Promise<UserRow | undefined> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user;
}

export interface AudienceMember {
  id: string;
  role: Role;
  state: MembershipState;
  hasAccess: boolean;
}

/**
 * Ids of the members matching `filter` (used to fan out notifications). Rejected
 * accounts never receive anything. Clubs are small, so states are computed here
 * with the same rules as everywhere else rather than re-implemented in SQL.
 */
export async function audienceIds(
  db: DbOrTx,
  { settings, today, now }: Pick<Viewer, 'settings' | 'today' | 'now'>,
  filter: (member: AudienceMember) => boolean,
  excludeId?: string | null,
): Promise<string[]> {
  const rows = await db
    .select({ id: users.id, ...stateColumns })
    .from(users)
    .where(sql`${users.status} <> 'rejected'`);
  return rows
    .filter((row) => row.id !== excludeId)
    .map((row) => ({ id: row.id, role: row.role, ...stateOf(row, settings, today, now) }))
    .filter(filter)
    .map((member) => member.id);
}

/** Ids of active staff holding `permission` (e.g. treasurers for payments to review). */
export async function staffWith(db: DbOrTx, permission: Permission): Promise<string[]> {
  const roles = (PERMISSIONS[permission] as readonly Role[]).slice();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, roles), eq(users.status, 'active')));
  return rows.map((row) => row.id);
}

/** Next free badge number (#0001, #0002, …). */
export async function nextBadgeNumber(db: DbOrTx): Promise<number> {
  const [row] = await db
    .select({ max: sql<number | null>`max(${users.badgeNumber})` })
    .from(users)
    .where(gte(users.badgeNumber, 0));
  return (row?.max ?? 0) + 1;
}
