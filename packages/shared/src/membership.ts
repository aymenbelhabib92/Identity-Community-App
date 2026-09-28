import { addDays, type IsoDate } from './dates';
import { isStaff, type Role } from './roles';

/** Stored on the member record. */
export const MEMBER_STATUSES = ['pending', 'active', 'suspended', 'rejected'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** Computed from the status and how far dues are paid. */
export const MEMBERSHIP_STATES = ['pending', 'active', 'due', 'expired', 'suspended', 'rejected'] as const;
export type MembershipState = (typeof MEMBERSHIP_STATES)[number];

export const MEMBERSHIP_STATE_LABELS: Record<MembershipState, string> = {
  pending: 'Pending',
  active: 'Active',
  due: 'Dues due',
  expired: 'Expired',
  suspended: 'Suspended',
  rejected: 'Not approved',
};

/**
 * - active:  dues cover today
 * - due:     coverage ended but we are within the grace period (still has access)
 * - expired: grace period is over
 */
export function membershipState(input: {
  status: MemberStatus;
  paidUntil: IsoDate | null;
  today: IsoDate;
  graceDays: number;
}): MembershipState {
  if (input.status !== 'active') return input.status;
  if (!input.paidUntil) return 'due';
  if (input.paidUntil >= input.today) return 'active';
  if (addDays(input.paidUntil, input.graceDays) >= input.today) return 'due';
  return 'expired';
}

/** Access to the member map, secret meetups and member-only content. */
export function hasMemberAccess(state: MembershipState, role: Role): boolean {
  if (state === 'suspended' || state === 'rejected') return false;
  return state === 'active' || state === 'due' || isStaff(role);
}

export function formatBadgeNumber(badge: number | null | undefined): string {
  return badge == null ? '—' : `#${String(badge).padStart(4, '0')}`;
}
