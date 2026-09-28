import {
  duesFrequencyLabel,
  formatDayDateTime,
  formatMoney,
  formatRelative,
  MEETUP_VISIBILITY_LABELS,
  MEMBERSHIP_STATE_LABELS,
  type MeetupVisibility,
  type MembershipState,
  type Payment,
  type PaymentStatus,
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

export const stateLabel = (state: MembershipState) => MEMBERSHIP_STATE_LABELS[state];

export const VISIBILITY_TONE: Record<MeetupVisibility, Tone> = {
  secret: 'red',
  public: 'blue',
  staff: 'orange',
};

export const visibilityLabel = (visibility: MeetupVisibility) => MEETUP_VISIBILITY_LABELS[visibility];

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: 'orange' | 'green' | 'red' }> = {
  pending: { label: 'Pending', tone: 'orange' },
  verified: { label: 'Verified', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
};

/** Second line of a payment row: "Proof uploaded · awaiting treasurer", "Paid in person"… */
export function paymentSubtitle(payment: Payment): string {
  if (payment.status === 'pending') {
    return payment.method === 'proof' ? 'Proof uploaded · awaiting treasurer' : 'Pay in person · awaiting treasurer';
  }
  if (payment.status === 'rejected') return payment.reviewNote ? `Rejected · ${payment.reviewNote}` : 'Rejected';
  return payment.method === 'proof' ? 'Payment proof' : 'Paid in person';
}

export function money(amount: number, currency = 'DT'): string {
  return formatMoney(amount, currency);
}

export function duesDescription(periodMonths: number, yearly: number, currency = 'DT'): string {
  return periodMonths === 12
    ? duesFrequencyLabel(periodMonths)
    : `${duesFrequencyLabel(periodMonths)} · ${formatMoney(yearly, currency)} / year`;
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning,';
  if (hour >= 12 && hour < 18) return 'Good afternoon,';
  return 'Good evening,';
}

export { formatDayDateTime, formatRelative };
