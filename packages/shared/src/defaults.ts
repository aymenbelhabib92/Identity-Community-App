/**
 * Default club texts, used until an admin rewrites them. Kept apart from the
 * settings schema so the translations can refer to them without bundling zod.
 */

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
- Location sharing is optional and always approximate (about 100 m).
- Never share another member's position outside the app.`;

export const DEFAULT_MEET_RULES = `No racing, no burnouts, no noise near homes.
Share nothing about the spot outside the club.`;

export const DEFAULT_PAYMENT_INSTRUCTIONS = `Pay the treasurer in person at a meetup, or send the amount by bank transfer or D17 and upload the receipt here. Ask an organizer for the account details.`;
