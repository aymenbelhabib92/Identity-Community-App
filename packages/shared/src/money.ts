/**
 * Amounts are stored as integer millimes (1 DT = 1000 millimes) so fees such as
 * 7.500 DT stay exact.
 */
export const MILLIMES_PER_UNIT = 1000;

/** "20 DT", "7.500 DT" */
export function formatMoney(millimes: number, currency = 'DT'): string {
  const units = millimes / MILLIMES_PER_UNIT;
  const text = Number.isInteger(units) ? String(units) : units.toFixed(3);
  return `${text} ${currency}`;
}

/** "20", "7.5", "7,500" → millimes. Returns null for anything else. */
export function parseMoney(input: string): number | null {
  const normalized = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * MILLIMES_PER_UNIT);
}

/** Millimes → plain decimal string for form inputs ("20", "7.5"). */
export function moneyToInput(millimes: number): string {
  return String(millimes / MILLIMES_PER_UNIT);
}
