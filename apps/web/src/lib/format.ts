import {
  DEFAULT_CLUB_RULES,
  DEFAULT_MEET_RULES,
  DEFAULT_PAYMENT_INSTRUCTIONS,
  duesFrequencyLabel,
  formatDayDateTime,
  formatIsoDate,
  formatMoney,
  formatRelative,
  isJustNow,
  MEETUP_VISIBILITY_LABELS,
  MEMBERSHIP_STATE_LABELS,
  ROLE_LABELS,
  t,
  toIsoDate,
  zonedParts,
  type MeetupVisibility,
  type MembershipState,
  type Payment,
  type PaymentStatus,
  type Role,
} from '@identity/shared';
import type { Tone } from '../components/ui';

export const STATE_TONE: Record<MembershipState, Tone> = {
  active: 'green',
  pending: 'orange',
  due: 'orange',
  expired: 'red',
  suspended: 'red',
  rejected: 'gray',
};

export const stateLabel = (state: MembershipState) => t(MEMBERSHIP_STATE_LABELS[state]);

export const roleLabel = (role: Role) => t(ROLE_LABELS[role]);

export const VISIBILITY_TONE: Record<MeetupVisibility, Tone> = {
  secret: 'red',
  public: 'blue',
  staff: 'orange',
};

export const visibilityLabel = (visibility: MeetupVisibility) => t(MEETUP_VISIBILITY_LABELS[visibility]);

/** Labels are English source texts: show them with `t(label)`. */
export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: 'orange' | 'green' | 'red' }> = {
  pending: { label: 'Pending', tone: 'orange' },
  verified: { label: 'Verified', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
};

/** Second line of a payment row: "Proof uploaded · awaiting treasurer", "Paid in person"… */
export function paymentSubtitle(payment: Payment): string {
  if (payment.status === 'pending') {
    return payment.method === 'proof' ? t('Proof uploaded · awaiting treasurer') : t('Pay in person · awaiting treasurer');
  }
  if (payment.status === 'rejected') return payment.reviewNote ? `${t('Rejected')} · ${payment.reviewNote}` : t('Rejected');
  return payment.method === 'proof' ? t('Payment proof') : t('Paid in person');
}

export function money(amount: number, currency = 'DT'): string {
  return formatMoney(amount, currency);
}

export function duesDescription(periodMonths: number, yearly: number, currency = 'DT'): string {
  return periodMonths === 12
    ? duesFrequencyLabel(periodMonths)
    : `${duesFrequencyLabel(periodMonths)} · ${t('{amount} / year', { amount: formatMoney(yearly, currency) })}`;
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return t('Good morning,');
  if (hour >= 12 && hour < 18) return t('Good afternoon,');
  return t('Good evening,');
}

const DEFAULT_CLUB_TEXTS: ReadonlySet<string> = new Set([DEFAULT_CLUB_RULES, DEFAULT_MEET_RULES, DEFAULT_PAYMENT_INSTRUCTIONS]);

/**
 * Club texts (rules, payment instructions) still at their default are shown in
 * the member's language; texts written by the admins are shown as written.
 */
export const clubText = (text: string) => (DEFAULT_CLUB_TEXTS.has(text) ? t(text) : text);

/** "Just now", "5m ago", "Yesterday", "12 Sep". */
export function timeAgo(date: string): string {
  if (isJustNow(date)) return t('Just now');
  const relative = formatRelative(date);
  return /\d\s?(m|min|h|d|j)$/.test(relative) ? t('{time} ago', { time: relative }) : relative;
}

/** "28 Sep 2026" from a timestamp, in the device's time zone. */
export function dateOf(timestamp: string): string {
  const p = zonedParts(new Date(timestamp));
  return formatIsoDate(toIsoDate(p.y, p.m, p.d));
}

export { formatDayDateTime, formatRelative };
