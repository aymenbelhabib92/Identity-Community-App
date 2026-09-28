import { addDays, MONTHS_SHORT, parseIsoDate, toIsoDate, type IsoDate } from './dates';

/**
 * Dues are paid per period. Periods are calendar-aligned blocks of N months
 * starting in January (N = 3 gives quarters Q1..Q4), so every member pays for
 * the same "Q4 2026" and the treasurer can announce it.
 */
export const DUES_PERIOD_MONTHS = [1, 2, 3, 4, 6, 12] as const;
export type DuesPeriodMonths = (typeof DUES_PERIOD_MONTHS)[number];

/** First day of the period that contains `date`. */
export function periodStartOf(date: IsoDate, months: number): IsoDate {
  const { y, m } = parseIsoDate(date);
  const startMonth = Math.floor((m - 1) / months) * months + 1;
  return toIsoDate(y, startMonth, 1);
}

/** Start of the period `count` periods after the one starting at `start`. */
export function addPeriods(start: IsoDate, months: number, count: number): IsoDate {
  const { y, m } = parseIsoDate(start);
  const total = y * 12 + (m - 1) + months * count;
  return toIsoDate(Math.floor(total / 12), (total % 12) + 1, 1);
}

/** Last day covered by `count` periods starting at `start`. */
export function periodEnd(start: IsoDate, months: number, count = 1): IsoDate {
  return addDays(addPeriods(start, months, count), -1);
}

function singlePeriodLabel(start: IsoDate, months: number): string {
  const { y, m } = parseIsoDate(start);
  switch (months) {
    case 12:
      return String(y);
    case 6:
      return `H${Math.floor((m - 1) / 6) + 1} ${y}`;
    case 3:
      return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
    case 1:
      return `${MONTHS_SHORT[m - 1]} ${y}`;
    default:
      return `${MONTHS_SHORT[m - 1]}–${MONTHS_SHORT[m + months - 2]} ${y}`;
  }
}

/** "Q4 2026", or "Q4 2026 – Q3 2027" when several periods are paid at once. */
export function periodLabel(start: IsoDate, months: number, count = 1): string {
  if (count <= 1) return singlePeriodLabel(start, months);
  return `${singlePeriodLabel(start, months)} – ${singlePeriodLabel(addPeriods(start, months, count - 1), months)}`;
}

/** "Every 3 months" */
export function duesFrequencyLabel(months: number): string {
  if (months === 1) return 'Every month';
  if (months === 12) return 'Every year';
  return `Every ${months} months`;
}

export function yearlyDues(duesAmount: number, months: number): number {
  return Math.round(duesAmount * (12 / months));
}

/** Members can pay up to one year ahead in a single payment. */
export function maxPeriodsPerPayment(months: number): number {
  return Math.max(1, Math.floor(12 / months));
}

/**
 * First period a member still has to pay: the one right after what is already
 * covered (verified or awaiting review), or the current period when coverage
 * has lapsed — missed periods are not charged retroactively.
 */
export function nextDuesPeriodStart(coveredUntil: IsoDate | null, today: IsoDate, months: number): IsoDate {
  const current = periodStartOf(today, months);
  if (!coveredUntil) return current;
  const next = periodStartOf(addDays(coveredUntil, 1), months);
  return next > current ? next : current;
}
