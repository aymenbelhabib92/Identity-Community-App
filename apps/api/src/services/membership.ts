import {
  addDays,
  maxIsoDate,
  maxPeriodsPerPayment,
  nextDuesPeriodStart,
  periodEnd,
  periodLabel,
  periodStartOf,
  translate,
  yearlyDues,
  type ClubSettings,
  type DuesOption,
  type IsoDate,
  type Language,
  type MemberRef,
  type Membership,
  type Payment,
  type PaymentKind,
} from '@identity/shared';
import { desc, eq, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbOrTx } from '../db/client';
import { payments, users, type PaymentRow, type UserRow } from '../db/schema';
import { conflict, fieldError } from '../errors';
import type { Viewer } from '../types';
import { findUser, memberRefColumns, nextBadgeNumber, toMemberRef, toUserDto } from './users';

type PaymentPeriod = Pick<PaymentRow, 'kind' | 'periodStart' | 'periodMonths' | 'periodCount'>;

/** What the member sees and what `buildMembership` needs from the request. */
type Context = Pick<Viewer, 'settings' | 'today' | 'now' | 'lang'>;

export function paymentLabel(payment: PaymentPeriod, lang: Language): string {
  if (payment.kind === 'entry_fee' || !payment.periodStart || !payment.periodMonths) {
    return translate(lang, 'Entry fee & badge');
  }
  const period = periodLabel(payment.periodStart, payment.periodMonths, payment.periodCount ?? 1, lang);
  return translate(lang, '{period} dues', { period });
}

export function paymentPeriodEnd(payment: PaymentPeriod): IsoDate | null {
  if (payment.kind !== 'dues' || !payment.periodStart || !payment.periodMonths) return null;
  return periodEnd(payment.periodStart, payment.periodMonths, payment.periodCount ?? 1);
}

export function toPaymentDto(row: PaymentRow, reviewer: MemberRef | null, lang: Language): Payment {
  return {
    id: row.id,
    kind: row.kind,
    label: paymentLabel(row, lang),
    amount: row.amount,
    method: row.method,
    status: row.status,
    periodStart: row.periodStart,
    periodEnd: paymentPeriodEnd(row),
    periodCount: row.periodCount,
    note: row.note,
    reviewNote: row.reviewNote,
    hasProof: row.proofFile !== null,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewedBy: reviewer,
  };
}

export const reviewers = alias(users, 'reviewer');

/** Payments with the member who reviewed them, newest first. */
export async function listPaymentsWithReviewer(db: DbOrTx, where: SQL | undefined) {
  return db
    .select({ payment: payments, reviewer: memberRefColumns(reviewers) })
    .from(payments)
    .leftJoin(reviewers, eq(payments.reviewedById, reviewers.id))
    .where(where)
    .orderBy(desc(payments.createdAt));
}

export function entryFeeStatus(user: UserRow, userPayments: PaymentRow[]): Membership['entryFeeStatus'] {
  const entryFees = userPayments.filter((p) => p.kind === 'entry_fee');
  if (user.approvedAt || entryFees.some((p) => p.status === 'verified')) return 'paid';
  if (entryFees.some((p) => p.status === 'pending')) return 'pending';
  return 'unpaid';
}

/** Last day covered by verified dues plus dues awaiting review. */
function coveredUntil(user: UserRow, userPayments: PaymentRow[]): IsoDate | null {
  let covered = user.paidUntil;
  for (const payment of userPayments) {
    if (payment.kind === 'dues' && payment.status === 'pending') covered = maxIsoDate(covered, paymentPeriodEnd(payment));
  }
  return covered;
}

/** Dues are paid once the membership has been activated (entry fee verified). */
function canPayDues(user: UserRow): boolean {
  return user.status === 'active' && user.approvedAt !== null;
}

function duesOptions(settings: ClubSettings, covered: IsoDate | null, today: IsoDate, lang: Language): DuesOption[] {
  const months = settings.duesPeriodMonths;
  const start = nextDuesPeriodStart(covered, today, months);
  return Array.from({ length: maxPeriodsPerPayment(months) }, (_, index) => {
    const periods = index + 1;
    return {
      periods,
      label: periodLabel(start, months, periods, lang),
      amount: settings.duesAmount * periods,
      periodStart: start,
      periodEnd: periodEnd(start, months, periods),
    };
  });
}

export async function buildMembership(db: DbOrTx, user: UserRow, context: Context): Promise<Membership> {
  const { settings, today, now, lang } = context;
  const rows = await listPaymentsWithReviewer(db, eq(payments.userId, user.id));
  const userPayments = rows.map((row) => row.payment);
  return {
    member: toUserDto(user, context),
    fees: {
      currency: settings.currency,
      entryFee: settings.entryFee,
      duesAmount: settings.duesAmount,
      duesPeriodMonths: settings.duesPeriodMonths,
      yearlyDues: yearlyDues(settings.duesAmount, settings.duesPeriodMonths),
    },
    entryFeeStatus: entryFeeStatus(user, userPayments),
    duesOptions: canPayDues(user) ? duesOptions(settings, coveredUntil(user, userPayments), today, lang) : [],
    payments: rows.map((row) => toPaymentDto(row.payment, toMemberRef(row.reviewer, now), lang)),
    paymentInstructions: settings.paymentInstructions,
  };
}

export interface PreparedPayment {
  kind: PaymentKind;
  amount: number;
  periodStart: IsoDate | null;
  periodCount: number | null;
  periodMonths: number | null;
}

/**
 * Checks that `user` may pay `kind` now and prices it with the current settings.
 * Dues always start at the first period not yet covered.
 */
export async function preparePayment(
  db: DbOrTx,
  user: UserRow,
  settings: ClubSettings,
  today: IsoDate,
  request: { kind: PaymentKind; periods?: number | undefined },
): Promise<PreparedPayment> {
  const userPayments = await db.select().from(payments).where(eq(payments.userId, user.id));

  if (request.kind === 'entry_fee') {
    const status = entryFeeStatus(user, userPayments);
    if (status === 'paid') throw conflict('ENTRY_FEE_PAID', 'The entry fee is already paid.');
    if (status === 'pending') throw conflict('ENTRY_FEE_PENDING', 'The entry fee is already awaiting review.');
    if (user.status !== 'pending') throw conflict('NOT_PENDING', 'This membership request is closed.');
    return { kind: 'entry_fee', amount: settings.entryFee, periodStart: null, periodCount: null, periodMonths: null };
  }

  if (!canPayDues(user)) {
    throw conflict('ENTRY_FEE_FIRST', 'Dues can be paid once the membership is active.');
  }
  const months = settings.duesPeriodMonths;
  const periods = request.periods ?? 1;
  const max = maxPeriodsPerPayment(months);
  if (periods > max) throw fieldError('periods', 'Up to {max} periods can be paid at once.', { max });
  return {
    kind: 'dues',
    amount: settings.duesAmount * periods,
    periodStart: nextDuesPeriodStart(coveredUntil(user, userPayments), today, months),
    periodCount: periods,
    periodMonths: months,
  };
}

/**
 * First activation: assigns the badge and starts the coverage (the entry fee
 * covers the current period unless the club turned that off).
 */
export async function activateMember(
  db: DbOrTx,
  user: UserRow,
  settings: ClubSettings,
  today: IsoDate,
  now: Date,
): Promise<void> {
  const months = settings.duesPeriodMonths;
  const firstCovered = settings.entryFeeCoversFirstPeriod
    ? periodEnd(periodStartOf(today, months), months)
    : addDays(today, -1);
  await db
    .update(users)
    .set({
      status: 'active',
      approvedAt: user.approvedAt ?? now,
      badgeNumber: user.badgeNumber ?? (await nextBadgeNumber(db)),
      paidUntil: maxIsoDate(user.paidUntil, firstCovered),
    })
    .where(eq(users.id, user.id));
}

/** Effects of a verified payment: activation for the entry fee, extended coverage for dues. */
export async function applyVerifiedPayment(
  db: DbOrTx,
  payment: PaymentRow,
  settings: ClubSettings,
  today: IsoDate,
  now: Date,
): Promise<void> {
  const user = await findUser(db, payment.userId);
  if (!user) return;
  if (payment.kind === 'entry_fee') {
    if (!user.approvedAt && user.status === 'pending') await activateMember(db, user, settings, today, now);
    return;
  }
  const end = paymentPeriodEnd(payment);
  if (end) await db.update(users).set({ paidUntil: maxIsoDate(user.paidUntil, end) }).where(eq(users.id, user.id));
}
