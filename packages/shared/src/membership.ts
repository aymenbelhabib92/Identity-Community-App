import { addDays, type IsoDate } from './dates';
import { isStaff, type Role } from './roles';

/** Stored on the member record. */
export const MEMBER_STATUSES = ['pending', 'active', 'suspended', 'rejected'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** Computed from the status, how far dues are paid, and bans. */
export const MEMBERSHIP_STATES = ['pending', 'active', 'due', 'expired', 'suspended', 'banned', 'rejected'] as const;
export type MembershipState = (typeof MEMBERSHIP_STATES)[number];

export const MEMBERSHIP_STATE_LABELS: Record<MembershipState, string> = {
  pending: 'Pending',
  active: 'Active',
  due: 'Dues due',
  expired: 'Expired',
  suspended: 'Suspended',
  banned: 'Banned',
  rejected: 'Not approved',
};

/**
 * - active:  dues cover today
 * - due:     coverage ended but we are within the grace period (still has access)
 * - expired: grace period is over
 * - banned:  a ban is running (it ends by itself, see BAN_DAYS), or a ban for life
 */
export function membershipState(input: {
  status: MemberStatus;
  paidUntil: IsoDate | null;
  today: IsoDate;
  graceDays: number;
  banned?: boolean;
}): MembershipState {
  if (input.banned && input.status !== 'rejected') return 'banned';
  if (input.status !== 'active') return input.status;
  if (!input.paidUntil) return 'due';
  if (input.paidUntil >= input.today) return 'active';
  if (addDays(input.paidUntil, input.graceDays) >= input.today) return 'due';
  return 'expired';
}

/** Access to the member map, the chat, secret meetups and member-only content. */
export function hasMemberAccess(state: MembershipState, role: Role): boolean {
  if (state === 'suspended' || state === 'banned' || state === 'rejected') return false;
  return state === 'active' || state === 'due' || isStaff(role);
}

/**
 * Length of a ban, by how many bans the member already had: 3 days the first
 * time, 7 the second, then 15 each time. A ban for life is an admin's decision.
 */
export const BAN_DAYS = [3, 7, 15] as const;

/** `level`: 1 for a first ban. */
export function banDays(level: number): number {
  return BAN_DAYS[Math.min(Math.max(level, 1), BAN_DAYS.length) - 1]!;
}

export function formatBadgeNumber(badge: number | null | undefined): string {
  return badge == null ? '—' : `#${String(badge).padStart(4, '0')}`;
}
