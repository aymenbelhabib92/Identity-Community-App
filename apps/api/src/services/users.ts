import {
  can,
  hasMemberAccess,
  membershipState,
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
import type { DbOrTx } from '../db/client';
import { users, type UserRow } from '../db/schema';

const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export function stateOf(
  user: Pick<UserRow, 'status' | 'paidUntil' | 'role'>,
  settings: ClubSettings,
  today: IsoDate,
): { state: MembershipState; hasAccess: boolean } {
  const state = membershipState({ status: user.status, paidUntil: user.paidUntil, today, graceDays: settings.graceDays });
  return { state, hasAccess: hasMemberAccess(state, user.role) };
}

export function toUserDto(user: UserRow, settings: ClubSettings, today: IsoDate): User {
  const { state, hasAccess } = stateOf(user, settings, today);
  return {
    id: user.id,
    fullName: user.fullName,
    phone: user.phone,
    car: user.car,
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

export function toMemberRef(user: { id: string; fullName: string; role: Role } | null | undefined): MemberRef | null {
  return user ? { id: user.id, fullName: user.fullName, role: user.role } : null;
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
  settings: ClubSettings,
  today: IsoDate,
  filter: (member: AudienceMember) => boolean,
  excludeId?: string | null,
): Promise<string[]> {
  const rows = await db
    .select({ id: users.id, role: users.role, status: users.status, paidUntil: users.paidUntil })
    .from(users)
    .where(sql`${users.status} <> 'rejected'`);
  return rows
    .filter((row) => row.id !== excludeId)
    .map((row) => ({ id: row.id, role: row.role, ...stateOf(row, settings, today) }))
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
