import { z } from 'zod';
import { DUES_PERIOD_MONTHS } from './periods';

export const DEFAULT_CLUB_RULES = `# Respect first
- No racing, no burnouts, no drifting on public roads.
- No noise near homes: keep revs low and music down when arriving and leaving.
- Leave every spot cleaner than you found it.

# Secret meetups
- The meeting point is shared with confirmed members only, a few hours before start.
- Share nothing about the spot outside the club: no stories, no tags, no live location.

# Membership
- Your badge is personal. Bring it to meetups for check-in.
- Dues keep the club running. Pay by uploading a proof or in person to the treasurer.

# On the map
- Location sharing is optional and always approximate (± 500 m).
- Never share another member's position outside the app.`;

export const DEFAULT_MEET_RULES = `No racing, no burnouts, no noise near homes.
Share nothing about the spot outside the club.`;

export const DEFAULT_PAYMENT_INSTRUCTIONS = `Pay the treasurer in person at a meetup, or send the amount by bank transfer or D17 and upload the receipt here. Ask an organizer for the account details.`;

const settingsFields = {
  currency: z.string().trim().min(1).max(8),
  /** Millimes. */
  entryFee: z.number().int().min(0).max(10_000_000),
  /** Millimes, per dues period. */
  duesAmount: z.number().int().min(0).max(10_000_000),
  duesPeriodMonths: z.literal(DUES_PERIOD_MONTHS),
  /** The entry fee also covers the period in which the member is activated. */
  entryFeeCoversFirstPeriod: z.boolean(),
  /** Days after the paid period ends during which a member keeps access. */
  graceDays: z.number().int().min(0).max(90),
  /** Default delay before a secret meetup starts when its meeting point is revealed. */
  revealHoursBefore: z.number().int().min(0).max(72),
  /** Shared positions older than this disappear from the map. */
  locationTtlHours: z.number().int().min(1).max(168),
  paymentInstructions: z.string().max(2_000),
  clubRules: z.string().max(20_000),
  meetRules: z.string().max(2_000),
};

/** Club-wide parameters, editable by admins. */
export const clubSettingsSchema = z.object(settingsFields);
export type ClubSettings = z.infer<typeof clubSettingsSchema>;

export const clubSettingsUpdateSchema = z.object(settingsFields).partial();
export type ClubSettingsUpdate = z.infer<typeof clubSettingsUpdateSchema>;

export const DEFAULT_CLUB_SETTINGS: ClubSettings = {
  currency: 'DT',
  entryFee: 20_000,
  duesAmount: 5_000,
  duesPeriodMonths: 3,
  entryFeeCoversFirstPeriod: true,
  graceDays: 15,
  revealHoursBefore: 2,
  locationTtlHours: 24,
  paymentInstructions: DEFAULT_PAYMENT_INSTRUCTIONS,
  clubRules: DEFAULT_CLUB_RULES,
  meetRules: DEFAULT_MEET_RULES,
};

/**
 * Merges stored settings over the defaults, keeping only values that are still
 * valid (a field whose rules changed falls back to its default).
 */
export function resolveClubSettings(stored: unknown): ClubSettings {
  const result: Record<string, unknown> = { ...DEFAULT_CLUB_SETTINGS };
  if (stored && typeof stored === 'object') {
    for (const [key, schema] of Object.entries(settingsFields)) {
      const parsed = schema.safeParse((stored as Record<string, unknown>)[key]);
      if (parsed.success) result[key] = parsed.data;
    }
  }
  return result as ClubSettings;
}

/** What an unauthenticated visitor needs for the join screen. */
export const clubInfoSchema = clubSettingsSchema.pick({
  currency: true,
  entryFee: true,
  duesAmount: true,
  duesPeriodMonths: true,
});
export type ClubInfo = z.infer<typeof clubInfoSchema>;
